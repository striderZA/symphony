import os
import pytest
from symphony.workspace import WorkspaceManager
from symphony.exceptions import WorkspaceError


def test_create_issue_workspace(tmp_path):
    mgr = WorkspaceManager(root=str(tmp_path))
    ws = mgr.create_for_issue("PROJ-123")
    assert ws.workspace_key == "PROJ-123"
    assert os.path.isdir(ws.path)
    assert ws.created_now is True


def test_reuse_existing_workspace(tmp_path):
    mgr = WorkspaceManager(root=str(tmp_path))
    ws1 = mgr.create_for_issue("PROJ-123")
    ws2 = mgr.create_for_issue("PROJ-123")
    assert ws1.path == ws2.path
    assert ws2.created_now is False


def test_sanitized_workspace_key(tmp_path):
    mgr = WorkspaceManager(root=str(tmp_path))
    ws = mgr.create_for_issue("PROJ/foo@bar")
    assert ws.workspace_key == "PROJ_foo_bar"
    assert ws.path == os.path.join(str(tmp_path), "PROJ_foo_bar")


def test_containment_invariant(tmp_path):
    mgr = WorkspaceManager(root=str(tmp_path))
    ws = mgr.create_for_issue("PROJ-1")
    assert ws.path.startswith(str(tmp_path))


def test_after_create_hook(tmp_path):
    marker = tmp_path / "hook_ran.txt"
    script = f"type nul > {marker}"
    mgr = WorkspaceManager(root=str(tmp_path), after_create=script, hook_timeout_ms=5000)
    ws = mgr.create_for_issue("PROJ-1")
    assert marker.exists(), "after_create hook should have run"


def test_after_create_hook_only_on_new(tmp_path):
    marker = tmp_path / "hook_ran.txt"
    script = f"type nul > {marker}"
    mgr = WorkspaceManager(root=str(tmp_path), after_create=script, hook_timeout_ms=5000)
    ws1 = mgr.create_for_issue("PROJ-1")
    assert marker.exists()
    marker.unlink()
    ws2 = mgr.create_for_issue("PROJ-1")
    assert not marker.exists(), "hook should not run on reuse"


def test_after_create_hook_failure_aborts(tmp_path):
    script = "exit 1"
    mgr = WorkspaceManager(root=str(tmp_path), after_create=script, hook_timeout_ms=5000)
    with pytest.raises(WorkspaceError):
        mgr.create_for_issue("PROJ-2")


def test_before_run_hook(tmp_path):
    marker = tmp_path / "before_ran.txt"
    script = f"type nul > {marker}"
    mgr = WorkspaceManager(root=str(tmp_path), before_run=script, hook_timeout_ms=5000)
    ws = mgr.create_for_issue("PROJ-1")
    assert not marker.exists()
    mgr.run_before_run(ws)
    assert marker.exists()


def test_after_run_hook(tmp_path):
    marker = tmp_path / "after_ran.txt"
    script = f"type nul > {marker}"
    mgr = WorkspaceManager(root=str(tmp_path), after_run=script, hook_timeout_ms=5000)
    ws = mgr.create_for_issue("PROJ-1")
    mgr.run_after_run(ws)
    assert marker.exists()


def test_remove_workspace(tmp_path):
    mgr = WorkspaceManager(root=str(tmp_path))
    ws = mgr.create_for_issue("PROJ-1")
    assert os.path.isdir(ws.path)
    mgr.remove_for_issue("PROJ-1")
    assert not os.path.isdir(ws.path)
