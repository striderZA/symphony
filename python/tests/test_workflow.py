import pytest
from pathlib import Path
from symphony.workflow import load_workflow
from symphony.exceptions import (
    MissingWorkflowFile, WorkflowParseError, WorkflowFrontMatterNotAMap,
)

FIXTURES = Path(__file__).parent / "fixtures"


def test_load_minimal():
    wf = load_workflow(FIXTURES / "workflow_minimal.md")
    assert wf.config["tracker"]["kind"] == "linear"
    assert wf.config["tracker"]["project_slug"] == "test-proj"
    assert "{{ issue.identifier }}" in wf.prompt_template


def test_load_full():
    wf = load_workflow(FIXTURES / "workflow_full.md")
    assert wf.config["tracker"]["kind"] == "linear"
    assert wf.config["tracker"]["active_states"] == ["Todo", "In Progress"]
    assert wf.config["agent"]["max_concurrent_agents"] == 5
    assert wf.config["agent"]["max_turns"] == 10
    assert "{{ attempt }}" in wf.prompt_template


def test_load_no_frontmatter():
    wf = load_workflow(FIXTURES / "workflow_no_frontmatter.md")
    assert wf.config == {}
    assert "Just a plain prompt" in wf.prompt_template


def test_missing_file():
    with pytest.raises(MissingWorkflowFile):
        load_workflow(Path("/nonexistent/WORKFLOW.md"))


def test_bad_yaml():
    with pytest.raises((WorkflowParseError, WorkflowFrontMatterNotAMap)):
        load_workflow(FIXTURES / "workflow_bad_yaml.md")


def test_default_path_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    wf_path = tmp_path / "WORKFLOW.md"
    wf_path.write_text("---\ntracker:\n  kind: linear\n---\nBody")
    wf = load_workflow(None)
    assert wf.config["tracker"]["kind"] == "linear"
    assert wf.prompt_template == "Body"
