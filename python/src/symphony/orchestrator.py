import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any

from symphony.models import (
    Issue, OrchestratorState, RunningEntry, RetryEntry, CodexTotals,
)

logger = logging.getLogger(__name__)


def dispatch_key(issue: Issue) -> tuple:
    """Sort key: priority asc (None sorts last), created_at asc, identifier asc."""
    prio = issue.priority if issue.priority is not None else 9999
    created = issue.created_at if issue.created_at else datetime.min.replace(tzinfo=timezone.utc)
    return (prio, created, issue.identifier)


def should_dispatch(
    issue: Issue,
    state: OrchestratorState,
    active_states: list[str] | None = None,
    terminal_states: list[str] | None = None,
) -> bool:
    """Check if an issue is eligible for dispatch (§8.2)."""
    if issue.id in state.running:
        return False
    if issue.id in state.claimed:
        return False

    act = active_states or ["Todo", "In Progress"]
    term = terminal_states or ["Closed", "Cancelled", "Canceled", "Duplicate", "Done"]

    if issue.state not in act:
        return False
    if issue.state in term:
        return False

    if issue.state.lower() == "todo":
        for blocker in (issue.blocked_by or []):
            if blocker.state and blocker.state not in term:
                return False

    return True


def available_slots(state: OrchestratorState) -> int:
    """Global concurrency slots remaining."""
    return max(state.max_concurrent_agents - len(state.running), 0)


def available_slots_for_state(state: OrchestratorState, issue_state: str) -> int:
    """Per-state slots remaining, if configured. Otherwise fall back to global."""
    key = issue_state.lower()
    if key in state.max_concurrent_agents_by_state:
        limit = state.max_concurrent_agents_by_state[key]
        running_in_state = sum(
            1 for e in state.running.values()
            if e.issue.state.lower() == key
        )
        return max(limit - running_in_state, 0)
    return available_slots(state)


def normalize_attempt(attempt: int | None) -> int:
    return attempt if attempt is not None else 0


def backoff_delay(attempt: int, max_backoff_ms: int = 300000) -> int:
    """Exponential backoff: min(10000*2^(attempt-1), max_backoff_ms)."""
    if attempt <= 0:
        attempt = 1
    delay = 10000 * (2 ** (attempt - 1))
    return min(delay, max_backoff_ms)


def schedule_retry(
    state: OrchestratorState,
    issue_id: str,
    attempt: int,
    identifier: str,
    error: str | None = None,
    delay_ms: int | None = None,
) -> OrchestratorState:
    """Schedule a retry for an issue. Cancel existing timer if present."""
    state.retry_attempts.pop(issue_id, None)
    due = time.monotonic() + (delay_ms or 1000) / 1000.0
    entry = RetryEntry(
        issue_id=issue_id,
        identifier=identifier,
        attempt=attempt,
        due_at_ms=due * 1000,
        error=error,
    )
    state.retry_attempts[issue_id] = entry
    state.claimed.add(issue_id)
    return state


def reconcile_stalled_runs(
    state: OrchestratorState,
    stall_timeout_ms: int,
    now: datetime | None = None,
) -> OrchestratorState:
    """Check each running entry for stall timeout. Return updated state."""
    if stall_timeout_ms <= 0:
        return state
    now = now or datetime.now(timezone.utc)
    to_remove: list[str] = []
    for issue_id, entry in list(state.running.items()):
        reference = entry.last_codex_timestamp or entry.started_at
        if reference is None:
            continue
        elapsed = (now - reference).total_seconds() * 1000
        if elapsed > stall_timeout_ms:
            logger.warning("stall_detected",
                           extra={"issue_id": issue_id, "identifier": entry.identifier,
                                  "elapsed_ms": elapsed, "stall_timeout_ms": stall_timeout_ms})
            if entry.task and not entry.task.done():
                entry.task.cancel()
            to_remove.append(issue_id)

    for issue_id in to_remove:
        state = terminate_running_issue(state, issue_id, cleanup_workspace=False)
        state = schedule_retry(
            state, issue_id,
            attempt=1,
            identifier="unknown",
            error="stall_timeout",
        )
    return state


def terminate_running_issue(
    state: OrchestratorState,
    issue_id: str,
    cleanup_workspace: bool = False,
) -> OrchestratorState:
    """Remove a running entry and release its claim."""
    entry = state.running.pop(issue_id, None)
    state.claimed.discard(issue_id)
    if entry:
        if entry.started_at:
            elapsed = (datetime.now(timezone.utc) - entry.started_at).total_seconds()
            state.codex_totals.seconds_running += elapsed
        state.codex_totals.total_tokens += entry.codex_total_tokens
        state.codex_totals.input_tokens += entry.codex_input_tokens
        state.codex_totals.output_tokens += entry.codex_output_tokens
    return state


class SymphonyOrchestrator:
    """Main orchestrator: owns state machine, poll loop, worker lifecycle."""

    def __init__(
        self,
        tracker: Any,
        workspace_manager: Any | None = None,
        max_concurrent: int = 10,
        poll_interval_ms: int = 30000,
        active_states: list[str] | None = None,
        terminal_states: list[str] | None = None,
        max_turns: int = 20,
        max_retry_backoff_ms: int = 300000,
        max_concurrent_by_state: dict[str, int] | None = None,
        stall_timeout_ms: int = 300000,
    ):
        self.tracker = tracker
        self.workspace_manager = workspace_manager
        self.state = OrchestratorState(
            max_concurrent_agents=max_concurrent,
            poll_interval_ms=poll_interval_ms,
        )
        self.state.max_concurrent_agents_by_state = max_concurrent_by_state or {}
        self.active_states = active_states or ["Todo", "In Progress"]
        self.terminal_states = terminal_states or [
            "Closed", "Cancelled", "Canceled", "Duplicate", "Done",
        ]
        self.max_turns = max_turns
        self.max_retry_backoff_ms = max_retry_backoff_ms
        self.stall_timeout_ms = stall_timeout_ms
        self._tick_interval = poll_interval_ms / 1000.0
        self._running = True
        self._observers: list[Any] = []

    async def run(self):
        """Main loop: initial cleanup, immediate tick, then periodic."""
        logger.info("orchestrator_started")
        await self._startup_cleanup()
        await self._tick()
        while self._running:
            await asyncio.sleep(self._tick_interval)
            if not self._running:
                break
            await self._tick()
        logger.info("orchestrator_stopped")

    def stop(self):
        self._running = False

    async def _tick(self):
        """One poll-and-dispatch cycle (§16.2)."""
        self.state = await self._reconcile_running()

        validation = self._validate_dispatch()
        if validation:
            for v in validation:
                logger.error("dispatch_validation_error", extra={"error": v})
            self._notify_observers()
            return

        try:
            issues = self.tracker.fetch_candidate_issues()
        except Exception as e:
            logger.error("candidate_fetch_failed", extra={"error": str(e)})
            self._notify_observers()
            return

        for issue in sorted(issues, key=dispatch_key):
            if available_slots(self.state) <= 0:
                break
            per_state = available_slots_for_state(self.state, issue.state)
            if per_state <= 0:
                continue
            if should_dispatch(issue, self.state, self.active_states, self.terminal_states):
                self.state = self._dispatch_issue(issue)

        self._notify_observers()

    async def _reconcile_running(self) -> OrchestratorState:
        """Check for stalls and refresh issue states (§16.3)."""
        self.state = reconcile_stalled_runs(self.state, self.stall_timeout_ms)

        running_ids = list(self.state.running.keys())
        if not running_ids:
            return self.state

        try:
            refreshed = self.tracker.fetch_issue_states_by_ids(running_ids)
        except Exception as e:
            logger.debug("state_refresh_failed", extra={"error": str(e)})
            return self.state

        refreshed_map = {r.id: r for r in refreshed}
        for issue_id in list(self.state.running.keys()):
            refreshed_issue = refreshed_map.get(issue_id)
            if refreshed_issue is None:
                continue
            state = refreshed_issue.state
            if state in self.terminal_states:
                logger.info("reconcile_terminal",
                            extra={"issue_id": issue_id, "state": state, "cleanup": True})
                self.state = terminate_running_issue(self.state, issue_id, cleanup_workspace=True)
                if self.workspace_manager:
                    self.workspace_manager.remove_for_issue(refreshed_issue.identifier)
            elif state in self.active_states:
                self.state.running[issue_id].issue = refreshed_issue
            else:
                logger.info("reconcile_non_active",
                            extra={"issue_id": issue_id, "state": state, "cleanup": False})
                self.state = terminate_running_issue(self.state, issue_id, cleanup_workspace=False)

        return self.state

    async def _startup_cleanup(self):
        """Clean workspaces for terminal issues on startup (§8.6)."""
        try:
            terminal_issues = self.tracker.fetch_issues_by_states(self.terminal_states)
        except Exception as e:
            logger.warning("startup_cleanup_fetch_failed", extra={"error": str(e)})
            return
        if self.workspace_manager:
            for ti in terminal_issues:
                self.workspace_manager.remove_for_issue(ti.identifier)

    def _validate_dispatch(self) -> list[str]:
        return []

    def _dispatch_issue(self, issue: Issue, attempt: int | None = None) -> OrchestratorState:
        async def worker_wrapper():
            await self._run_worker(issue, attempt)

        task = asyncio.create_task(worker_wrapper())
        self.state.running[issue.id] = RunningEntry(
            task=task,
            identifier=issue.identifier,
            issue=issue,
            retry_attempt=normalize_attempt(attempt),
            started_at=datetime.now(timezone.utc),
        )
        self.state.claimed.add(issue.id)
        self.state.retry_attempts.pop(issue.id, None)
        logger.info("dispatched",
                    extra={"issue_id": issue.id, "identifier": issue.identifier, "state": issue.state})
        return self.state

    async def _run_worker(self, issue: Issue, attempt: int | None):
        try:
            if self.workspace_manager:
                ws = self.workspace_manager.create_for_issue(issue.identifier)
                self.workspace_manager.run_before_run(ws)

            await asyncio.sleep(0.1)

        except Exception as e:
            logger.error("worker_failed",
                         extra={"issue_id": issue.id, "identifier": issue.identifier, "error": str(e)})
            self._on_worker_exit(issue.id, normal=False)
            return

        self._on_worker_exit(issue.id, normal=True)

    def _on_worker_exit(self, issue_id: str, normal: bool):
        if issue_id not in self.state.running:
            return
        entry = self.state.running.pop(issue_id)
        self.state.claimed.discard(issue_id)

        if entry.started_at:
            elapsed = (datetime.now(timezone.utc) - entry.started_at).total_seconds()
            self.state.codex_totals.seconds_running += elapsed
        self.state.codex_totals.total_tokens += entry.codex_total_tokens
        self.state.codex_totals.input_tokens += entry.codex_input_tokens
        self.state.codex_totals.output_tokens += entry.codex_output_tokens

        if normal:
            self.state.completed.add(issue_id)
            self.state = schedule_retry(
                self.state, issue_id, attempt=1,
                identifier=entry.identifier,
                delay_ms=1000,
            )
        else:
            next_attempt = entry.retry_attempt + 1
            delay = backoff_delay(next_attempt, self.max_retry_backoff_ms)
            self.state = schedule_retry(
                self.state, issue_id, attempt=next_attempt,
                identifier=entry.identifier,
                error="worker_exit_abnormal",
                delay_ms=delay,
            )

        self._notify_observers()

    def add_observer(self, callback):
        self._observers.append(callback)

    def _notify_observers(self):
        for cb in self._observers:
            try:
                cb(self.state)
            except Exception as e:
                logger.warning("observer_error", extra={"error": str(e)})
