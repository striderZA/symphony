import pytest
from symphony.tracker.base import TrackerAdapter
from symphony.tracker.memory import MemoryTracker
from symphony.models import Issue


def test_memory_tracker_is_adapter():
    assert issubclass(MemoryTracker, TrackerAdapter)


def test_fetch_candidate_issues():
    tracker = MemoryTracker(issues=[
        Issue(id="1", identifier="PROJ-1", title="Fix", state="Todo"),
        Issue(id="2", identifier="PROJ-2", title="Done task", state="Done"),
    ])
    candidates = tracker.fetch_candidate_issues()
    assert len(candidates) == 1
    assert candidates[0].identifier == "PROJ-1"


def test_fetch_candidate_with_active_states():
    tracker = MemoryTracker(issues=[
        Issue(id="1", identifier="PROJ-1", title="Fix", state="Todo"),
        Issue(id="2", identifier="PROJ-2", title="In prog", state="In Progress"),
        Issue(id="3", identifier="PROJ-3", title="Review", state="Human Review"),
    ], active_states=["Todo", "In Progress"])
    candidates = tracker.fetch_candidate_issues()
    assert len(candidates) == 2


def test_fetch_issues_by_states():
    tracker = MemoryTracker(issues=[
        Issue(id="1", identifier="PROJ-1", title="Fix", state="Done"),
        Issue(id="2", identifier="PROJ-2", title="Close", state="Closed"),
        Issue(id="3", identifier="PROJ-3", title="Active", state="Todo"),
    ])
    results = tracker.fetch_issues_by_states(["Done", "Closed"])
    assert len(results) == 2
    assert {r.identifier for r in results} == {"PROJ-1", "PROJ-2"}


def test_fetch_issue_states_by_ids():
    tracker = MemoryTracker(issues=[
        Issue(id="1", identifier="PROJ-1", title="Fix", state="Todo"),
        Issue(id="2", identifier="PROJ-2", title="Done", state="Done"),
    ])
    results = tracker.fetch_issue_states_by_ids(["1", "2"])
    assert len(results) == 2
    state_map = {r.id: r.state for r in results}
    assert state_map == {"1": "Todo", "2": "Done"}


def test_empty_states_returns_empty():
    tracker = MemoryTracker()
    assert tracker.fetch_issues_by_states([]) == []
