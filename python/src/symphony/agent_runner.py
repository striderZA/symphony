import asyncio
import json
import logging
import shlex
from datetime import datetime, timezone
from typing import Any

from symphony.models import Issue
from symphony.exceptions import (
    CodexNotFound, InvalidWorkspaceCwd, ResponseTimeout,
    TurnTimeout, TurnFailed, TurnCancelled, TurnInputRequired,
)
from symphony.path_safety import check_containment

logger = logging.getLogger(__name__)


class AgentRunner:
    """Runs a Codex app-server session for one issue.

    Manages: subprocess lifecycle, JSON line protocol, turn loop.
    """

    def __init__(
        self,
        workspace_path: str,
        codex_command: str,
        issue: Issue,
        prompt: str,
        turn_timeout_ms: int = 3600000,
        read_timeout_ms: int = 5000,
        workspace_root: str | None = None,
        approval_policy: Any = None,
        thread_sandbox: Any = None,
        turn_sandbox_policy: Any = None,
    ):
        self.workspace_path = workspace_path
        self.workspace_root = workspace_root
        self.codex_command = codex_command
        self.issue = issue
        self.prompt = prompt
        self.turn_timeout_ms = turn_timeout_ms
        self.read_timeout_ms = read_timeout_ms

        self._process: asyncio.subprocess.Process | None = None
        self._thread_id: str | None = None
        self._turn_id: str | None = None
        self._session_id: str | None = None
        self._turn_count: int = 0
        self._input_tokens: int = 0
        self._output_tokens: int = 0
        self._total_tokens: int = 0
        self._events: list[dict] = []

    async def run(self) -> dict[str, Any]:
        self._validate_workspace()

        proc = await self._launch_process()
        if not proc:
            raise CodexNotFound("Failed to launch codex app-server")

        self._process = proc
        session = await self._init_session()
        if not session:
            raise TurnFailed("Session initialization failed")

        summary = {
            "session_id": self._session_id,
            "thread_id": self._thread_id,
            "turn_count": self._turn_count,
            "input_tokens": self._input_tokens,
            "output_tokens": self._output_tokens,
            "total_tokens": self._total_tokens,
            "events": self._events,
        }
        await self._stop_process()
        return summary

    def _validate_workspace(self):
        if self.workspace_root:
            check_containment(self.workspace_path, self.workspace_root)

    async def _launch_process(self) -> asyncio.subprocess.Process | None:
        cmd = f"bash -lc {shlex.quote(self.codex_command)}"
        try:
            proc = await asyncio.create_subprocess_shell(
                cmd,
                cwd=self.workspace_path,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            return proc
        except FileNotFoundError:
            return None

    async def _init_session(self) -> bool:
        if not self._process or not self._process.stdout:
            return False

        thread_request = {
            "method": "threads/create",
            "params": {
                "title": f"{self.issue.identifier}: {self.issue.title}",
                "problem_statement": self.prompt,
            },
        }
        response = await self._send_request(thread_request)
        if not response:
            return False

        thread = response.get("result", {})
        self._thread_id = thread.get("thread_id") or thread.get("id")
        if not self._thread_id:
            return False

        self._session_id = f"{self._thread_id}-init"
        self._events.append({
            "event": "session_started",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "thread_id": self._thread_id,
        })
        return True

    async def _send_request(self, request: dict) -> dict | None:
        if not self._process or not self._process.stdin:
            return None
        line = json.dumps(request) + "\n"
        try:
            self._process.stdin.write(line.encode())
            await self._process.stdin.drain()
        except BrokenPipeError:
            return None

        return await self._read_response()

    async def _read_response(self) -> dict | None:
        if not self._process or not self._process.stdout:
            return None
        try:
            line = await asyncio.wait_for(
                self._process.stdout.readline(),
                timeout=self.read_timeout_ms / 1000.0,
            )
        except asyncio.TimeoutError:
            raise ResponseTimeout("Read timeout on codex response")
        except Exception:
            return None

        if not line:
            return None
        try:
            return json.loads(line.decode("utf-8").strip())
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None

    async def _stop_process(self):
        if self._process and self._process.returncode is None:
            self._process.kill()
            await self._process.wait()
