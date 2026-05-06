import pytest
import os
from pathlib import Path
from symphony.workflow_store import WorkflowStore


def test_store_initial_load(tmp_path):
    wf_file = tmp_path / "WORKFLOW.md"
    wf_file.write_text("---\ntracker:\n  kind: linear\n---\nHello")
    store = WorkflowStore(path=str(wf_file))
    assert store.workflow is not None
    assert store.workflow.config["tracker"]["kind"] == "linear"
    assert store.workflow.prompt_template == "Hello"


def test_store_missing_file(tmp_path):
    store = WorkflowStore(path=str(tmp_path / "nonexistent.md"))
    assert store.workflow is None
    assert store.last_error is not None
    assert "not found" in store.last_error.lower()
