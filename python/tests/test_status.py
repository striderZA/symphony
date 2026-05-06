import pytest
from datetime import datetime, timezone
from symphony.status import build_status_snapshot
from symphony.models import OrchestratorState, RunningEntry, RetryEntry, Issue, CodexTotals


def test_empty_state():
    state = OrchestratorState()
    snap = build_status_snapshot(state)
    assert snap["counts"]["running"] == 0
    assert snap["counts"]["retrying"] == 0
    assert snap["codex_totals"]["total_tokens"] == 0
    assert snap["codex_totals"]["seconds_running"] == 0.0
    assert snap["rate_limits"] is None


def test_running_entries():
    state = OrchestratorState()
    now = datetime.now(timezone.utc)
    entry = RunningEntry(
        task=None,
        identifier="PROJ-1",
        issue=Issue(id="1", identifier="PROJ-1", title="Fix it", state="In Progress"),
        session_id="thr-1-turn-1",
        last_codex_event="turn_completed",
        last_codex_message="Done working",
        last_codex_timestamp=now,
        codex_input_tokens=500,
        codex_output_tokens=200,
        codex_total_tokens=700,
        started_at=now,
    )
    state.running["1"] = entry
    snap = build_status_snapshot(state)
    assert snap["counts"]["running"] == 1
    assert snap["running"][0]["issue_identifier"] == "PROJ-1"
    assert snap["running"][0]["state"] == "In Progress"
    assert snap["running"][0]["tokens"]["input_tokens"] == 500


def test_retry_entries():
    state = OrchestratorState()
    entry = RetryEntry(issue_id="1", identifier="PROJ-1", attempt=3, due_at_ms=5000000.0, error="no slot")
    state.retry_attempts["1"] = entry
    snap = build_status_snapshot(state)
    assert snap["counts"]["retrying"] == 1
    assert snap["retrying"][0]["attempt"] == 3
    assert snap["retrying"][0]["error"] == "no slot"
