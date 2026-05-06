import pytest
from datetime import datetime, timezone
from symphony.models import (
    Issue, BlockerRef, WorkflowDefinition, Workspace, RunAttempt,
    LiveSession, RetryEntry, OrchestratorState, RunningEntry, CodexTotals,
)


def test_issue_minimal():
    issue = Issue(id="abc", identifier="PROJ-1", title="Fix bug", state="Todo")
    assert issue.id == "abc"
    assert issue.identifier == "PROJ-1"
    assert issue.title == "Fix bug"
    assert issue.state == "Todo"
    assert issue.priority is None
    assert issue.labels == []


def test_issue_with_all_fields():
    issue = Issue(
        id="abc",
        identifier="PROJ-1",
        title="Fix bug",
        description="Need to fix",
        priority=1,
        state="In Progress",
        branch_name="fix-bug",
        url="https://linear.app/proj/issue/PROJ-1",
        labels=["Bug", "Urgent"],
        blocked_by=[BlockerRef(id="def", identifier="PROJ-2", state="Done")],
        created_at=datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 1, 2, 12, 0, 0, tzinfo=timezone.utc),
    )
    assert issue.labels == ["bug", "urgent"]
    assert issue.blocked_by[0].identifier == "PROJ-2"
    assert issue.priority == 1


def test_workspace_model():
    ws = Workspace(path="/tmp/ws/PROJ-1", workspace_key="PROJ-1", created_now=True)
    assert ws.path == "/tmp/ws/PROJ-1"
    assert ws.workspace_key == "PROJ-1"
    assert ws.created_now is True


def test_workflow_definition():
    wf = WorkflowDefinition(config={"tracker": {"kind": "linear"}}, prompt_template="Do {{ issue.title }}")
    assert wf.config["tracker"]["kind"] == "linear"
    assert "{{ issue.title }}" in wf.prompt_template


def test_run_attempt():
    ra = RunAttempt(
        issue_id="abc",
        issue_identifier="PROJ-1",
        attempt=None,
        workspace_path="/tmp/ws/PROJ-1",
        started_at=datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc),
        status="PreparingWorkspace",
    )
    assert ra.attempt is None
    assert ra.status == "PreparingWorkspace"


def test_live_session():
    ls = LiveSession(
        session_id="thread-1-turn-1",
        thread_id="thread-1",
        turn_id="turn-1",
    )
    assert ls.session_id == "thread-1-turn-1"


def test_retry_entry():
    re = RetryEntry(issue_id="abc", identifier="PROJ-1", attempt=1, due_at_ms=5000.0, timer_handle="handle")
    assert re.attempt == 1
    assert re.error is None


def test_codex_totals():
    ct = CodexTotals()
    assert ct.input_tokens == 0
    assert ct.output_tokens == 0
    assert ct.total_tokens == 0
    assert ct.seconds_running == 0.0


def test_orchestrator_state():
    state = OrchestratorState()
    assert state.running == {}
    assert state.claimed == set()
    assert state.retry_attempts == {}
    assert state.completed == set()
    assert state.codex_totals.input_tokens == 0
    assert state.codex_rate_limits is None


def test_running_entry():
    issue = Issue(id="1", identifier="PROJ-1", title="Test", state="Todo")
    entry = RunningEntry(task=None, identifier="PROJ-1", issue=issue)
    assert entry.identifier == "PROJ-1"
    assert entry.retry_attempt == 0
    assert entry.codex_total_tokens == 0
