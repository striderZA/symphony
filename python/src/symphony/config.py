import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from symphony.models import WorkflowDefinition

_VAR_PATTERN = re.compile(r"^\$(\w+)$")


def _resolve_var(value: str, env: dict[str, str] | None = None) -> str:
    """If value is $VAR_NAME, resolve from environment. Otherwise return as-is."""
    env = env or os.environ
    m = _VAR_PATTERN.match(value)
    if m:
        return env.get(m.group(1), "")
    return value


def _expand_path(value: str, workflow_dir: str | None = None) -> str:
    """Expand ~ and resolve relative paths."""
    expanded = os.path.expanduser(str(value))
    if workflow_dir and not os.path.isabs(expanded):
        expanded = os.path.normpath(os.path.join(workflow_dir, expanded))
    return os.path.abspath(expanded)


@dataclass
class TrackerConfig:
    kind: str = ""
    endpoint: str = ""
    api_key: str = ""
    project_slug: str = ""
    active_states: list[str] = field(default_factory=lambda: ["Todo", "In Progress"])
    terminal_states: list[str] = field(default_factory=lambda: ["Closed", "Cancelled", "Canceled", "Duplicate", "Done"])


@dataclass
class PollingConfig:
    interval_ms: int = 30000


@dataclass
class WorkspaceConfig:
    root: str = ""


@dataclass
class HooksConfig:
    after_create: str | None = None
    before_run: str | None = None
    after_run: str | None = None
    before_remove: str | None = None
    timeout_ms: int = 60000


@dataclass
class AgentConfig:
    max_concurrent_agents: int = 10
    max_turns: int = 20
    max_retry_backoff_ms: int = 300000
    max_concurrent_agents_by_state: dict[str, int] = field(default_factory=dict)


@dataclass
class CodexConfig:
    command: str = "codex app-server"
    approval_policy: Any = None
    thread_sandbox: Any = None
    turn_sandbox_policy: Any = None
    turn_timeout_ms: int = 3600000
    read_timeout_ms: int = 5000
    stall_timeout_ms: int = 300000


@dataclass
class ServerConfig:
    port: int | None = None


@dataclass
class ServiceConfig:
    tracker: TrackerConfig = field(default_factory=TrackerConfig)
    polling: PollingConfig = field(default_factory=PollingConfig)
    workspace: WorkspaceConfig = field(default_factory=WorkspaceConfig)
    hooks: HooksConfig = field(default_factory=HooksConfig)
    agent: AgentConfig = field(default_factory=AgentConfig)
    codex: CodexConfig = field(default_factory=CodexConfig)
    server: ServerConfig = field(default_factory=ServerConfig)

    def validate_dispatch(self) -> list[str]:
        """Run preflight validation (§6.3). Return list of error messages."""
        errors: list[str] = []
        if not self.tracker.kind:
            errors.append("tracker.kind is required")
        elif self.tracker.kind != "linear":
            errors.append(f"unsupported tracker.kind: {self.tracker.kind}")
        if not self.tracker.api_key:
            errors.append("tracker.api_key is missing or empty after $ resolution")
        if self.tracker.kind == "linear" and not self.tracker.project_slug:
            errors.append("tracker.project_slug is required for linear tracker")
        if not self.codex.command:
            errors.append("codex.command is required")
        return errors


def build_service_config(
    wf: WorkflowDefinition,
    workflow_dir: str | None = None,
    env_overrides: dict[str, str] | None = None,
) -> ServiceConfig:
    """Build ServiceConfig from a WorkflowDefinition.

    Applies defaults, $VAR resolution, path expansion.
    """
    raw = wf.config
    env = env_overrides if env_overrides is not None else os.environ

    # Tracker
    tracker_raw = raw.get("tracker", {})
    kind = tracker_raw.get("kind", "")
    endpoint = tracker_raw.get("endpoint", "")
    if not endpoint and kind == "linear":
        endpoint = "https://api.linear.app/graphql"
    api_key = _resolve_var(tracker_raw.get("api_key", ""), env)
    project_slug = tracker_raw.get("project_slug", "")

    tc = TrackerConfig(
        kind=kind,
        endpoint=endpoint,
        api_key=api_key,
        project_slug=project_slug,
        active_states=tracker_raw.get("active_states", ["Todo", "In Progress"]),
        terminal_states=tracker_raw.get("terminal_states", [
            "Closed", "Cancelled", "Canceled", "Duplicate", "Done",
        ]),
    )

    # Polling
    poll_raw = raw.get("polling", {})
    pc = PollingConfig(interval_ms=poll_raw.get("interval_ms", 30000))

    # Workspace
    ws_raw = raw.get("workspace", {})
    ws_root = ""
    if "root" in ws_raw:
        ws_root = _expand_path(ws_raw["root"], workflow_dir)
    else:
        import tempfile
        ws_root = os.path.join(tempfile.gettempdir(), "symphony_workspaces")
    wc = WorkspaceConfig(root=ws_root)

    # Hooks
    h_raw = raw.get("hooks", {})
    hc = HooksConfig(
        after_create=h_raw.get("after_create"),
        before_run=h_raw.get("before_run"),
        after_run=h_raw.get("after_run"),
        before_remove=h_raw.get("before_remove"),
        timeout_ms=h_raw.get("timeout_ms", 60000),
    )

    # Agent
    a_raw = raw.get("agent", {})
    per_state = {}
    for k, v in (a_raw.get("max_concurrent_agents_by_state", {}) or {}).items():
        if isinstance(v, int) and v > 0:
            per_state[k.lower()] = v
    ac = AgentConfig(
        max_concurrent_agents=a_raw.get("max_concurrent_agents", 10),
        max_turns=a_raw.get("max_turns", 20),
        max_retry_backoff_ms=a_raw.get("max_retry_backoff_ms", 300000),
        max_concurrent_agents_by_state=per_state,
    )

    # Codex
    c_raw = raw.get("codex", {})
    cc = CodexConfig(
        command=c_raw.get("command", "codex app-server"),
        approval_policy=c_raw.get("approval_policy"),
        thread_sandbox=c_raw.get("thread_sandbox"),
        turn_sandbox_policy=c_raw.get("turn_sandbox_policy"),
        turn_timeout_ms=c_raw.get("turn_timeout_ms", 3600000),
        read_timeout_ms=c_raw.get("read_timeout_ms", 5000),
        stall_timeout_ms=c_raw.get("stall_timeout_ms", 300000),
    )

    # Server
    s_raw = raw.get("server", {})
    sc = ServerConfig(port=s_raw.get("port"))

    return ServiceConfig(
        tracker=tc,
        polling=pc,
        workspace=wc,
        hooks=hc,
        agent=ac,
        codex=cc,
        server=sc,
    )
