import pytest
from datetime import datetime, timezone
from symphony.models import (
    Issue, OrchestratorState, RunningEntry, RetryEntry, CodexTotals, BlockerRef,
)
from symphony.orchestrator import (
    dispatch_key, should_dispatch, available_slots, available_slots_for_state,
    schedule_retry, backoff_delay, normalize_attempt,
    reconcile_stalled_runs, terminate_running_issue,
)


def test_dispatch_sort_priority():
    issues = [
        Issue(id="1", identifier="PROJ-3", title="Low pri", state="Todo", priority=3),
        Issue(id="2", identifier="PROJ-1", title="High pri", state="Todo", priority=1),
        Issue(id="3", identifier="PROJ-2", title="Mid pri", state="Todo", priority=2),
    ]
    sorted_issues = sorted(issues, key=dispatch_key)
    assert [i.identifier for i in sorted_issues] == ["PROJ-1", "PROJ-2", "PROJ-3"]


def test_dispatch_sort_oldest_first():
    issues = [
        Issue(id="1", identifier="PROJ-2", title="Newer", state="Todo", priority=1,
              created_at=datetime(2026, 2, 2, tzinfo=timezone.utc)),
        Issue(id="2", identifier="PROJ-1", title="Older", state="Todo", priority=1,
              created_at=datetime(2026, 1, 1, tzinfo=timezone.utc)),
    ]
    sorted_issues = sorted(issues, key=dispatch_key)
    assert [i.identifier for i in sorted_issues] == ["PROJ-1", "PROJ-2"]


def test_dispatch_sort_null_priority_last():
    issues = [
        Issue(id="2", identifier="PROJ-2", title="No pri", state="Todo", priority=None),
        Issue(id="1", identifier="PROJ-1", title="Has pri", state="Todo", priority=1),
    ]
    sorted_issues = sorted(issues, key=dispatch_key)
    assert [i.identifier for i in sorted_issues] == ["PROJ-1", "PROJ-2"]


def test_should_dispatch_not_running():
    issue = Issue(id="1", identifier="PROJ-1", title="Fix", state="Todo")
    state = OrchestratorState()
    assert should_dispatch(issue, state)


def test_should_dispatch_already_running():
    issue = Issue(id="1", identifier="PROJ-1", title="Fix", state="Todo")
    state = OrchestratorState()
    state.running["1"] = RunningEntry(task=None, identifier="PROJ-1", issue=issue)
    assert not should_dispatch(issue, state)


def test_should_dispatch_already_claimed():
    issue = Issue(id="1", identifier="PROJ-1", title="Fix", state="Todo")
    state = OrchestratorState()
    state.claimed.add("1")
    assert not should_dispatch(issue, state)


def test_should_dispatch_todo_blocked_non_terminal():
    blocker = BlockerRef(id="b1", identifier="PROJ-2", state="In Progress")
    issue = Issue(id="1", identifier="PROJ-1", title="Fix", state="Todo", blocked_by=[blocker])
    state = OrchestratorState(terminal_states=["Done"])
    assert not should_dispatch(issue, state, terminal_states=["Done"])


def test_should_dispatch_todo_blocked_terminal():
    blocker = BlockerRef(id="b1", identifier="PROJ-2", state="Done")
    issue = Issue(id="1", identifier="PROJ-1", title="Fix", state="Todo", blocked_by=[blocker])
    state = OrchestratorState(terminal_states=["Done"])
    assert should_dispatch(issue, state, terminal_states=["Done"])


def test_available_slots_global():
    state = OrchestratorState(max_concurrent_agents=5)
    assert available_slots(state) == 5
    state.running["1"] = RunningEntry(task=None, identifier="P-1", issue=Issue(id="1", identifier="P-1", title="", state="Todo"))
    state.running["2"] = RunningEntry(task=None, identifier="P-2", issue=Issue(id="2", identifier="P-2", title="", state="Todo"))
    assert available_slots(state) == 3


def test_available_slots_for_state():
    state = OrchestratorState(max_concurrent_agents=5, max_concurrent_agents_by_state={"todo": 2})
    state.running["1"] = RunningEntry(task=None, identifier="P-1", issue=Issue(id="1", identifier="P-1", title="", state="Todo"))
    assert available_slots_for_state(state, "Todo") == 1
    assert available_slots_for_state(state, "In Progress") == 4  # fallback to global


def test_normalize_attempt():
    assert normalize_attempt(None) == 0
    assert normalize_attempt(0) == 0
    assert normalize_attempt(1) == 1
    assert normalize_attempt(5) == 5


def test_backoff_delay():
    assert backoff_delay(attempt=1, max_backoff_ms=300000) == 10000
    assert backoff_delay(attempt=2, max_backoff_ms=300000) == 20000
    assert backoff_delay(attempt=3, max_backoff_ms=300000) == 40000
    assert backoff_delay(attempt=10, max_backoff_ms=300000) == 300000


def test_backoff_delay_zero():
    assert backoff_delay(attempt=0) == 10000


def test_reconcile_stalled_no_entries():
    state = OrchestratorState()
    result = reconcile_stalled_runs(state, stall_timeout_ms=1000)
    assert result is state


def test_reconcile_stalled_recent():
    state = OrchestratorState()
    now = datetime.now(timezone.utc)
    entry = RunningEntry(task=None, identifier="P-1", issue=Issue(id="1", identifier="P-1", title="", state="Todo"),
                         started_at=now)
    state.running["1"] = entry
    result = reconcile_stalled_runs(state, stall_timeout_ms=300000)
    assert "1" in result.running


def test_terminate_running_issue():
    state = OrchestratorState()
    entry = RunningEntry(task=None, identifier="P-1", issue=Issue(id="1", identifier="P-1", title="", state="Todo"))
    state.running["1"] = entry
    state.claimed.add("1")
    state = terminate_running_issue(state, "1", cleanup_workspace=True)
    assert "1" not in state.running
    assert "1" not in state.claimed
