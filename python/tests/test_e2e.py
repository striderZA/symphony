import asyncio
import pytest
from pathlib import Path
from symphony.workflow import load_workflow
from symphony.config import build_service_config
from symphony.orchestrator import SymphonyOrchestrator
from symphony.tracker.memory import MemoryTracker
from symphony.models import Issue


@pytest.mark.asyncio
async def test_e2e_dispatch_and_retry(tmp_path):
    wf_file = tmp_path / "WORKFLOW.md"
    wf_file.write_text(f"""---
tracker:
  kind: linear
  project_slug: test
workspace:
  root: {tmp_path}/ws
agent:
  max_concurrent_agents: 2
  max_turns: 3
codex:
  command: echo
---
Work on {{ issue.identifier }}
""")
    wf = load_workflow(str(wf_file))
    config = build_service_config(wf, workflow_dir=str(tmp_path))
    tracker = MemoryTracker(issues=[
        Issue(id="1", identifier="PROJ-1", title="Fix", state="Todo", priority=1),
        Issue(id="2", identifier="PROJ-2", title="Improve", state="In Progress", priority=2),
        Issue(id="3", identifier="PROJ-3", title="Done task", state="Done"),
    ])
    from symphony.workspace import WorkspaceManager
    ws_mgr = WorkspaceManager(
        root=config.workspace.root,
        hook_timeout_ms=config.hooks.timeout_ms,
    )

    orch = SymphonyOrchestrator(
        tracker=tracker,
        workspace_manager=ws_mgr,
        max_concurrent=config.agent.max_concurrent_agents,
        max_turns=config.agent.max_turns,
        active_states=config.tracker.active_states,
        terminal_states=config.tracker.terminal_states,
    )

    await orch._tick()

    assert "1" in orch.state.running or "1" in orch.state.retry_attempts
    assert "2" in orch.state.running or "2" in orch.state.retry_attempts
    assert "3" not in orch.state.running
    assert "3" not in orch.state.retry_attempts
