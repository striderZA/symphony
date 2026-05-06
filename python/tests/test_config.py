import os
import pytest
from symphony.config import ServiceConfig, build_service_config
from symphony.models import WorkflowDefinition


def test_defaults_from_empty_config():
    wf = WorkflowDefinition(config={}, prompt_template="")
    cfg = build_service_config(wf)
    assert cfg.tracker.kind == ""
    assert cfg.tracker.endpoint == ""
    assert cfg.tracker.api_key == ""
    assert cfg.tracker.project_slug == ""
    assert cfg.tracker.active_states == ["Todo", "In Progress"]
    assert cfg.tracker.terminal_states == [
        "Closed", "Cancelled", "Canceled", "Duplicate", "Done",
    ]
    assert cfg.polling.interval_ms == 30000
    assert cfg.hooks.timeout_ms == 60000
    assert cfg.agent.max_concurrent_agents == 10
    assert cfg.agent.max_turns == 20
    assert cfg.agent.max_retry_backoff_ms == 300000
    assert cfg.agent.max_concurrent_agents_by_state == {}
    assert cfg.codex.command == "codex app-server"
    assert cfg.codex.turn_timeout_ms == 3600000
    assert cfg.codex.read_timeout_ms == 5000
    assert cfg.codex.stall_timeout_ms == 300000


def test_var_resolution(monkeypatch):
    monkeypatch.setenv("MY_KEY", "sk-abc123")
    wf = WorkflowDefinition(
        config={"tracker": {"api_key": "$MY_KEY", "kind": "linear"}},
        prompt_template="",
    )
    cfg = build_service_config(wf)
    assert cfg.tracker.api_key == "sk-abc123"


def test_var_resolution_empty_env(monkeypatch):
    monkeypatch.delenv("MISSING_KEY", raising=False)
    wf = WorkflowDefinition(
        config={"tracker": {"api_key": "$MISSING_KEY", "kind": "linear"}},
        prompt_template="",
    )
    cfg = build_service_config(wf)
    assert cfg.tracker.api_key == ""


def test_literal_api_key():
    wf = WorkflowDefinition(
        config={"tracker": {"api_key": "sk-literal", "kind": "linear"}},
        prompt_template="",
    )
    cfg = build_service_config(wf)
    assert cfg.tracker.api_key == "sk-literal"


def test_home_expansion():
    wf = WorkflowDefinition(
        config={"workspace": {"root": "~/symphony_ws"}},
        prompt_template="",
    )
    cfg = build_service_config(wf)
    assert cfg.workspace.root.startswith(os.path.expanduser("~"))


def test_relative_workspace_root(tmp_path):
    wf = WorkflowDefinition(
        config={"workspace": {"root": "my_ws"}},
        prompt_template="",
    )
    cfg = build_service_config(wf, workflow_dir=str(tmp_path))
    expected = str(tmp_path / "my_ws")
    assert os.path.normpath(cfg.workspace.root) == os.path.normpath(expected)


def test_per_state_concurrency_normalization():
    wf = WorkflowDefinition(
        config={
            "agent": {
                "max_concurrent_agents_by_state": {
                    "In Progress": 3,
                    "todo": 2,
                    "invalid": -1,
                }
            }
        },
        prompt_template="",
    )
    cfg = build_service_config(wf)
    assert cfg.agent.max_concurrent_agents_by_state == {"in progress": 3, "todo": 2}


def test_dispatch_validation_pass():
    wf = WorkflowDefinition(
        config={
            "tracker": {
                "kind": "linear",
                "api_key": "$VALID_KEY",
                "project_slug": "test",
            },
            "codex": {"command": "codex app-server"},
        },
        prompt_template="",
    )
    cfg = build_service_config(wf, env_overrides={"VALID_KEY": "sk-abc"})
    errors = cfg.validate_dispatch()
    assert errors == []


def test_dispatch_validation_fails():
    wf = WorkflowDefinition(config={}, prompt_template="")
    cfg = build_service_config(wf)
    errors = cfg.validate_dispatch()
    assert len(errors) > 0
    assert any("tracker.kind" in e for e in errors)
