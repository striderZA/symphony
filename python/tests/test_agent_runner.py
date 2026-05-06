import pytest
from symphony.agent_runner import AgentRunner
from symphony.models import Issue


def test_agent_runner_requires_workspace(tmp_path):
    runner = AgentRunner(
        workspace_path=str(tmp_path),
        codex_command="codex app-server",
        issue=Issue(id="1", identifier="PROJ-1", title="Fix", state="Todo"),
        prompt="Work on PROJ-1",
    )
    assert runner.workspace_path == str(tmp_path)
    assert runner.codex_command == "codex app-server"
    assert runner.issue.identifier == "PROJ-1"


def test_agent_runner_workspace_validation(tmp_path):
    runner = AgentRunner(
        workspace_path=str(tmp_path),
        codex_command="echo test",
        issue=Issue(id="1", identifier="PROJ-1", title="Fix", state="Todo"),
        prompt="Work",
    )
    runner._validate_workspace()  # should not raise without workspace_root
