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
