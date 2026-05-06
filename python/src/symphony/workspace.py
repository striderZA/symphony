import asyncio
import logging
import os
import shutil
from symphony.models import Workspace
from symphony.path_safety import sanitize_workspace_key, check_containment
from symphony.hooks import run_hook
from symphony.exceptions import WorkspaceError

logger = logging.getLogger(__name__)


class WorkspaceManager:
    def __init__(
        self,
        root: str,
        after_create: str | None = None,
        before_run: str | None = None,
        after_run: str | None = None,
        before_remove: str | None = None,
        hook_timeout_ms: int = 60000,
    ):
        self.root = os.path.abspath(root)
        self.after_create = after_create
        self.before_run = before_run
        self.after_run = after_run
        self.before_remove = before_remove
        self.hook_timeout_ms = hook_timeout_ms

    def create_for_issue(self, identifier: str) -> Workspace:
        key = sanitize_workspace_key(identifier)
        path = os.path.join(self.root, key)

        check_containment(path, self.root)

        created_now = False
        if not os.path.isdir(path):
            try:
                os.makedirs(path, exist_ok=True)
                created_now = True
            except OSError as e:
                raise WorkspaceError(f"Failed to create workspace {path}: {e}")

        ws = Workspace(path=path, workspace_key=key, created_now=created_now)

        if created_now and self.after_create:
            self._run_hook_sync(self.after_create, path, "after_create", abort_on_fail=True)

        return ws

    def run_before_run(self, ws: Workspace) -> None:
        if self.before_run:
            self._run_hook_sync(self.before_run, ws.path, "before_run", abort_on_fail=True)

    def run_after_run(self, ws: Workspace) -> None:
        if self.after_run:
            self._run_hook_sync(self.after_run, ws.path, "after_run", abort_on_fail=False)

    def remove_for_issue(self, identifier: str) -> None:
        key = sanitize_workspace_key(identifier)
        path = os.path.join(self.root, key)

        if os.path.isdir(path):
            if self.before_remove:
                self._run_hook_sync(self.before_remove, path, "before_remove", abort_on_fail=False)
            try:
                shutil.rmtree(path)
                logger.info("workspace_removed", extra={"path": path, "identifier": identifier})
            except OSError as e:
                logger.error("workspace_remove_failed", extra={"path": path, "error": str(e)})

    def _run_hook_sync(self, script: str, cwd: str, name: str, abort_on_fail: bool) -> None:
        try:
            result = asyncio.run(run_hook(
                script=script,
                cwd=cwd,
                timeout_ms=self.hook_timeout_ms,
                hook_name=name,
                best_effort=not abort_on_fail,
            ))
            if abort_on_fail and not result:
                raise WorkspaceError(f"Hook '{name}' failed")
        except Exception as e:
            if abort_on_fail:
                raise WorkspaceError(f"Hook '{name}' failed: {e}") from e
            logger.warning("hook_nonfatal_error", extra={"hook": name, "error": str(e)})
