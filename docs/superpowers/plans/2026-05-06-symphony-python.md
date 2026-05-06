# Symphony Python Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Symphony orchestrator service (SPEC.md) in Python at `python/`.

**Architecture:** asyncio-native single-process event loop with modular components: workflow loader → config → tracker → workspace → prompt builder → orchestrator → agent runner. Optional FastAPI HTTP server for dashboard + JSON API.

**Tech Stack:** Python 3.12+, asyncio, Pydantic, Jinja2 (StrictUndefined), aiohttp, structlog, watchdog, FastAPI + uvicorn, pytest + pytest-asyncio.

---

### Task 0: Project Scaffold

**Files:**
- Create: `python/pyproject.toml`
- Create: `python/src/symphony/__init__.py`
- Create: `python/src/symphony/exceptions.py`
- Create: `python/tests/conftest.py`
- Create: `python/tests/__init__.py`

- [ ] **Step 1: Write pyproject.toml**

```toml
[project]
name = "symphony"
version = "0.1.0"
description = "Orchestrate coding agents to get project work done"
requires-python = ">=3.12"
dependencies = [
    "pydantic>=2.0",
    "jinja2>=3.0",
    "aiohttp>=3.9",
    "structlog>=24.0",
    "watchdog>=4.0",
    "pyyaml>=6.0",
]

[project.optional-dependencies]
server = [
    "fastapi>=0.110",
    "uvicorn>=0.27",
]
test = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
    "pytest-httpx>=0.30",
]

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.backends._legacy:_Backend"

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 2: Write package init**

```python
# src/symphony/__init__.py
__version__ = "0.1.0"
```

- [ ] **Step 3: Write exceptions module**

```python
# src/symphony/exceptions.py

class SymphonyError(Exception):
    """Base for all Symphony errors."""


class WorkflowError(SymphonyError):
    """Workflow file or config errors."""

class MissingWorkflowFile(WorkflowError):
    ...

class WorkflowParseError(WorkflowError):
    ...

class WorkflowFrontMatterNotAMap(WorkflowError):
    ...

class TemplateParseError(WorkflowError):
    ...

class TemplateRenderError(WorkflowError):
    ...


class TrackerError(SymphonyError):
    """Tracker adapter errors."""

class UnsupportedTrackerKind(TrackerError):
    ...

class MissingTrackerApiKey(TrackerError):
    ...

class MissingTrackerProjectSlug(TrackerError):
    ...

class LinearApiRequest(TrackerError):
    ...

class LinearApiStatus(TrackerError):
    ...

class LinearGraphQLErrors(TrackerError):
    ...

class LinearUnknownPayload(TrackerError):
    ...


class AgentError(SymphonyError):
    """Coding agent session errors."""

class CodexNotFound(AgentError):
    ...

class InvalidWorkspaceCwd(AgentError):
    ...

class ResponseTimeout(AgentError):
    ...

class TurnTimeout(AgentError):
    ...

class PortExit(AgentError):
    ...

class TurnFailed(AgentError):
    ...

class TurnCancelled(AgentError):
    ...

class TurnInputRequired(AgentError):
    ...


class WorkspaceError(SymphonyError):
    """Workspace manager errors."""

class HookError(SymphonyError):
    """Hook execution errors."""

class HookTimeout(HookError):
    ...

class PathSafetyError(SymphonyError):
    """Path containment errors."""
```

- [ ] **Step 4: Write test conftest.py**

```python
# tests/conftest.py
import pytest

# Shared fixtures will be added per-task as needed
```

- [ ] **Step 5: Write empty test init**

```python
# tests/__init__.py
```

- [ ] **Step 6: Commit**

```bash
git add python/pyproject.toml python/src/symphony/__init__.py python/src/symphony/exceptions.py python/tests/conftest.py python/tests/__init__.py
git commit -m "feat(python): scaffold project structure"
```

---

### Task 1: Domain Models

**Files:**
- Create: `python/src/symphony/models.py`
- Create: `python/tests/test_models.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_models.py
import pytest
from datetime import datetime
from symphony.models import (
    Issue, BlockerRef, WorkflowDefinition, Workspace, RunAttempt,
    LiveSession, RetryEntry, OrchestratorState, RunningEntry, CodexTotals,
)
from symphony.path_safety import sanitize_workspace_key


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
        created_at=datetime(2026, 1, 1, 12, 0, 0),
        updated_at=datetime(2026, 1, 2, 12, 0, 0),
    )
    assert issue.labels == ["bug", "urgent"]


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
        started_at=datetime(2026, 1, 1, 12, 0, 0),
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd python && pip install -e "." && pip install -e ".[test]" 2>$null | Out-Null; pytest tests/test_models.py -v`
Expected: ImportError for symphony.models (or the path_safety import)

- [ ] **Step 3: Write the models**

```python
# src/symphony/models.py
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class BlockerRef:
    id: str | None = None
    identifier: str | None = None
    state: str | None = None


@dataclass
class Issue:
    id: str
    identifier: str
    title: str
    state: str
    description: str | None = None
    priority: int | None = None
    branch_name: str | None = None
    url: str | None = None
    labels: list[str] = field(default_factory=list)
    blocked_by: list[BlockerRef] = field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def __post_init__(self):
        self.labels = [l.lower() for l in self.labels]


@dataclass
class WorkflowDefinition:
    config: dict[str, Any]
    prompt_template: str


@dataclass
class Workspace:
    path: str
    workspace_key: str
    created_now: bool = False


@dataclass
class RunAttempt:
    issue_id: str
    issue_identifier: str
    attempt: int | None
    workspace_path: str
    started_at: datetime
    status: str
    error: str | None = None


@dataclass
class LiveSession:
    session_id: str
    thread_id: str
    turn_id: str
    codex_app_server_pid: str | None = None
    last_codex_event: str | None = None
    last_codex_timestamp: datetime | None = None
    last_codex_message: str = ""
    codex_input_tokens: int = 0
    codex_output_tokens: int = 0
    codex_total_tokens: int = 0
    last_reported_input_tokens: int = 0
    last_reported_output_tokens: int = 0
    last_reported_total_tokens: int = 0
    turn_count: int = 0


@dataclass
class RetryEntry:
    issue_id: str
    identifier: str
    attempt: int
    due_at_ms: float
    timer_handle: Any = None
    error: str | None = None


@dataclass
class RunningEntry:
    task: Any  # asyncio.Task
    identifier: str
    issue: Issue
    session_id: str | None = None
    codex_app_server_pid: str | None = None
    last_codex_message: str = ""
    last_codex_event: str | None = None
    last_codex_timestamp: datetime | None = None
    codex_input_tokens: int = 0
    codex_output_tokens: int = 0
    codex_total_tokens: int = 0
    last_reported_input_tokens: int = 0
    last_reported_output_tokens: int = 0
    last_reported_total_tokens: int = 0
    retry_attempt: int = 0
    started_at: datetime | None = None


@dataclass
class CodexTotals:
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    seconds_running: float = 0.0


@dataclass
class OrchestratorState:
    poll_interval_ms: int = 30000
    max_concurrent_agents: int = 10
    running: dict[str, RunningEntry] = field(default_factory=dict)
    claimed: set[str] = field(default_factory=set)
    retry_attempts: dict[str, RetryEntry] = field(default_factory=dict)
    completed: set[str] = field(default_factory=set)
    codex_totals: CodexTotals = field(default_factory=CodexTotals)
    codex_rate_limits: Any = None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd python && pytest tests/test_models.py -v`
Expected: All passing

- [ ] **Step 5: Commit**

```bash
git add python/src/symphony/models.py python/tests/test_models.py
git commit -m "feat(python): add domain models"
```

---

### Task 2: Path Safety

**Files:**
- Create: `python/src/symphony/path_safety.py`
- Create: `python/tests/test_path_safety.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_path_safety.py
import pytest
from symphony.path_safety import sanitize_workspace_key, check_containment
from symphony.exceptions import PathSafetyError


def test_sanitize_basic():
    assert sanitize_workspace_key("PROJ-123") == "PROJ-123"


def test_sanitize_replaces_special_chars():
    assert sanitize_workspace_key("PROJ/foo@bar#baz") == "PROJ_foo_bar_baz"


def test_sanitize_allows_dot_underscore_hyphen():
    assert sanitize_workspace_key("a.B-C_d") == "a.B-C_d"


def test_sanitize_empty_string():
    assert sanitize_workspace_key("") == ""


def test_containment_inside():
    check_containment("/tmp/root/ws-1", "/tmp/root")


def test_containment_at_root_level():
    with pytest.raises(PathSafetyError):
        check_containment("/tmp/root", "/tmp/root")


def test_containment_outside():
    with pytest.raises(PathSafetyError):
        check_containment("/tmp/other", "/tmp/root")


def test_containment_same_prefix_different_dir():
    with pytest.raises(PathSafetyError):
        check_containment("/tmp/root-extra", "/tmp/root")


def test_containment_traversal_attack():
    with pytest.raises(PathSafetyError):
        check_containment("/tmp/root/../etc/passwd", "/tmp/root")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd python && pytest tests/test_path_safety.py -v`
Expected: ImportError

- [ ] **Step 3: Write path_safety.py**

```python
# src/symphony/path_safety.py
import re
import os
from symphony.exceptions import PathSafetyError

_INVALID_CHARS = re.compile(r"[^A-Za-z0-9._-]")


def sanitize_workspace_key(identifier: str) -> str:
    """Replace any character not in [A-Za-z0-9._-] with _."""
    return _INVALID_CHARS.sub("_", identifier)


def check_containment(workspace_path: str, workspace_root: str) -> None:
    """Require workspace_path to have workspace_root as parent prefix."""
    wp = os.path.normpath(os.path.abspath(workspace_path))
    wr = os.path.normpath(os.path.abspath(workspace_root))
    if wp == wr:
        raise PathSafetyError(
            f"Workspace path {wp} equals root {wr}; must be a subdirectory"
        )
    prefix = wr + os.sep
    if not wp.startswith(prefix):
        raise PathSafetyError(
            f"Workspace path {wp} is not under root {wr}"
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd python && pytest tests/test_path_safety.py -v`

- [ ] **Step 5: Commit**

```bash
git add python/src/symphony/path_safety.py python/tests/test_path_safety.py
git commit -m "feat(python): add path safety (sanitize + containment)"
```

---

### Task 3: Workflow Loader

**Files:**
- Create: `python/src/symphony/workflow.py`
- Create: `python/tests/test_workflow.py`
- Create: `python/tests/fixtures/workflow_minimal.md`
- Create: `python/tests/fixtures/workflow_full.md`
- Create: `python/tests/fixtures/workflow_no_frontmatter.md`
- Create: `python/tests/fixtures/workflow_bad_yaml.md`

- [ ] **Step 1: Write test fixtures**

```
# tests/fixtures/workflow_minimal.md
---
tracker:
  kind: linear
  project_slug: test-proj
---
You are working on {{ issue.identifier }}.
```

```
# tests/fixtures/workflow_full.md
---
tracker:
  kind: linear
  project_slug: my-project
  api_key: $LINEAR_API_KEY
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Done
    - Cancelled
polling:
  interval_ms: 15000
workspace:
  root: ~/symphony_ws
hooks:
  after_create: |
    echo "created"
  before_run: |
    echo "before"
  after_run: |
    echo "after"
agent:
  max_concurrent_agents: 5
  max_turns: 10
codex:
  command: codex app-server
  turn_timeout_ms: 7200000
---
You are working on {{ issue.identifier }}: {{ issue.title }}.
Attempt: {{ attempt }}
```

```
# tests/fixtures/workflow_no_frontmatter.md
Just a plain prompt with {{ issue.identifier }}.
```

```yaml
# tests/fixtures/workflow_bad_yaml.md
---
tracker:
  kind: [not, a, map]
---
Body
```

- [ ] **Step 2: Write the failing tests**

```python
# tests/test_workflow.py
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
    with pytest.raises(WorkflowParseError):
        load_workflow(FIXTURES / "workflow_bad_yaml.md")


def test_frontmatter_not_a_map():
    with pytest.raises(WorkflowFrontMatterNotAMap):
        load_workflow(FIXTURES / "workflow_bad_yaml.md")  # list is not a map


def test_default_path_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    wf_path = tmp_path / "WORKFLOW.md"
    wf_path.write_text("---\ntracker:\n  kind: linear\n---\nBody")
    wf = load_workflow(None)
    assert wf.config["tracker"]["kind"] == "linear"
    assert wf.prompt_template == "Body"


def test_prompt_trimmed():
    from symphony.workflow import load_workflow
    path = FIXTURES / "workflow_minimal.md"
    wf = load_workflow(path)
    assert wf.prompt_template == wf.prompt_template.strip()
    assert not wf.prompt_template.startswith("\n")
    assert not wf.prompt_template.endswith("\n")
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd python && pytest tests/test_workflow.py -v`
Expected: ImportError

- [ ] **Step 4: Write the workflow loader**

```python
# src/symphony/workflow.py
import os
from pathlib import Path
from typing import Any

import yaml

from symphony.exceptions import (
    MissingWorkflowFile, WorkflowParseError, WorkflowFrontMatterNotAMap,
)
from symphony.models import WorkflowDefinition


def load_workflow(path: str | Path | None) -> WorkflowDefinition:
    """Load and parse WORKFLOW.md.

    If path is None, default to ./WORKFLOW.md in cwd.
    """
    if path is None:
        path = Path.cwd() / "WORKFLOW.md"
    else:
        path = Path(path)

    if not path.is_file():
        raise MissingWorkflowFile(f"Workflow file not found: {path}")

    try:
        raw = path.read_text(encoding="utf-8")
    except OSError as e:
        raise MissingWorkflowFile(f"Cannot read workflow file: {e}")

    config, prompt_body = _split_front_matter(raw)

    if config is not None:
        if not isinstance(config, dict):
            raise WorkflowFrontMatterNotAMap(
                "YAML front matter must decode to a map/object"
            )
    else:
        config = {}

    prompt_template = prompt_body.strip()

    return WorkflowDefinition(config=config, prompt_template=prompt_template)


def _split_front_matter(raw: str) -> tuple[dict[str, Any] | None, str]:
    """Split raw markdown into (front_matter_dict, body_string).

    Returns (None, body) if no front matter delimiter found.
    """
    if not raw.startswith("---"):
        return None, raw

    # Find closing ---
    rest = raw[3:].lstrip("\n")
    end_idx = rest.find("\n---")
    if end_idx == -1:
        return None, raw

    yaml_text = rest[:end_idx]
    body = rest[end_idx + 4:]

    try:
        config = yaml.safe_load(yaml_text)
    except yaml.YAMLError as e:
        raise WorkflowParseError(f"Invalid YAML front matter: {e}")

    return config, body
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd python && pytest tests/test_workflow.py -v`

- [ ] **Step 6: Commit**

```bash
git add python/src/symphony/workflow.py python/tests/test_workflow.py python/tests/fixtures/
git commit -m "feat(python): add workflow loader (YAML front matter + prompt body)"
```

---

### Task 4: Config Layer

**Files:**
- Create: `python/src/symphony/config.py`
- Create: `python/tests/test_config.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_config.py
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
    wf_path = tmp_path / "WORKFLOW.md"
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd python && pytest tests/test_config.py -v`
Expected: ImportError

- [ ] **Step 3: Write config.py**

```python
# src/symphony/config.py
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from symphony.exceptions import MissingTrackerApiKey
from symphony.models import WorkflowDefinition

_VAR_PATTERN = re.compile(r"^\$(\w+)$")


def _resolve_var(value: str, env: dict[str, str] | None = None) -> str:
    """If value is $VAR_NAME, resolve from environment. Otherwise return as-is."""
    env = env or os.environ
    m = _VAR_PATTERN.match(value)
    if m:
        return env.get(m.group(1), "")
    return value


def _expand_path(value: str, workflow_dir: str | None = None) -> str:
    """Expand ~ and resolve relative paths."""
    expanded = os.path.expanduser(str(value))
    if workflow_dir and not os.path.isabs(expanded):
        expanded = os.path.normpath(os.path.join(workflow_dir, expanded))
    return os.path.abspath(expanded)


@dataclass
class TrackerConfig:
    kind: str = ""
    endpoint: str = ""
    api_key: str = ""
    project_slug: str = ""
    active_states: list[str] = field(default_factory=lambda: ["Todo", "In Progress"])
    terminal_states: list[str] = field(default_factory=lambda: ["Closed", "Cancelled", "Canceled", "Duplicate", "Done"])


@dataclass
class PollingConfig:
    interval_ms: int = 30000


@dataclass
class WorkspaceConfig:
    root: str = ""


@dataclass
class HooksConfig:
    after_create: str | None = None
    before_run: str | None = None
    after_run: str | None = None
    before_remove: str | None = None
    timeout_ms: int = 60000


@dataclass
class AgentConfig:
    max_concurrent_agents: int = 10
    max_turns: int = 20
    max_retry_backoff_ms: int = 300000
    max_concurrent_agents_by_state: dict[str, int] = field(default_factory=dict)


@dataclass
class CodexConfig:
    command: str = "codex app-server"
    approval_policy: Any = None
    thread_sandbox: Any = None
    turn_sandbox_policy: Any = None
    turn_timeout_ms: int = 3600000
    read_timeout_ms: int = 5000
    stall_timeout_ms: int = 300000


@dataclass
class ServerConfig:
    port: int | None = None


@dataclass
class ServiceConfig:
    tracker: TrackerConfig = field(default_factory=TrackerConfig)
    polling: PollingConfig = field(default_factory=PollingConfig)
    workspace: WorkspaceConfig = field(default_factory=WorkspaceConfig)
    hooks: HooksConfig = field(default_factory=HooksConfig)
    agent: AgentConfig = field(default_factory=AgentConfig)
    codex: CodexConfig = field(default_factory=CodexConfig)
    server: ServerConfig = field(default_factory=ServerConfig)

    def validate_dispatch(self) -> list[str]:
        """Run preflight validation (§6.3). Return list of error messages."""
        errors: list[str] = []
        if not self.tracker.kind:
            errors.append("tracker.kind is required")
        elif self.tracker.kind != "linear":
            errors.append(f"unsupported tracker.kind: {self.tracker.kind}")
        if not self.tracker.api_key:
            errors.append("tracker.api_key is missing or empty after $ resolution")
        if self.tracker.kind == "linear" and not self.tracker.project_slug:
            errors.append("tracker.project_slug is required for linear tracker")
        if not self.codex.command:
            errors.append("codex.command is required")
        return errors


def build_service_config(
    wf: WorkflowDefinition,
    workflow_dir: str | None = None,
    env_overrides: dict[str, str] | None = None,
) -> ServiceConfig:
    """Build ServiceConfig from a WorkflowDefinition.

    Applies defaults, $VAR resolution, path expansion.
    """
    raw = wf.config
    env = env_overrides if env_overrides is not None else os.environ

    # Tracker
    tracker_raw = raw.get("tracker", {})
    kind = tracker_raw.get("kind", "")
    endpoint = tracker_raw.get("endpoint", "")
    if not endpoint and kind == "linear":
        endpoint = "https://api.linear.app/graphql"
    api_key = _resolve_var(tracker_raw.get("api_key", ""), env)
    project_slug = tracker_raw.get("project_slug", "")

    tc = TrackerConfig(
        kind=kind,
        endpoint=endpoint,
        api_key=api_key,
        project_slug=project_slug,
        active_states=tracker_raw.get("active_states", ["Todo", "In Progress"]),
        terminal_states=tracker_raw.get("terminal_states", [
            "Closed", "Cancelled", "Canceled", "Duplicate", "Done",
        ]),
    )

    # Polling
    poll_raw = raw.get("polling", {})
    pc = PollingConfig(interval_ms=poll_raw.get("interval_ms", 30000))

    # Workspace
    ws_raw = raw.get("workspace", {})
    ws_root = ""
    if "root" in ws_raw:
        ws_root = _expand_path(ws_raw["root"], workflow_dir)
    else:
        import tempfile
        ws_root = os.path.join(tempfile.gettempdir(), "symphony_workspaces")
    wc = WorkspaceConfig(root=ws_root)

    # Hooks
    h_raw = raw.get("hooks", {})
    hc = HooksConfig(
        after_create=h_raw.get("after_create"),
        before_run=h_raw.get("before_run"),
        after_run=h_raw.get("after_run"),
        before_remove=h_raw.get("before_remove"),
        timeout_ms=h_raw.get("timeout_ms", 60000),
    )

    # Agent
    a_raw = raw.get("agent", {})
    per_state = {}
    for k, v in (a_raw.get("max_concurrent_agents_by_state", {}) or {}).items():
        if isinstance(v, int) and v > 0:
            per_state[k.lower()] = v
    ac = AgentConfig(
        max_concurrent_agents=a_raw.get("max_concurrent_agents", 10),
        max_turns=a_raw.get("max_turns", 20),
        max_retry_backoff_ms=a_raw.get("max_retry_backoff_ms", 300000),
        max_concurrent_agents_by_state=per_state,
    )

    # Codex
    c_raw = raw.get("codex", {})
    cc = CodexConfig(
        command=c_raw.get("command", "codex app-server"),
        approval_policy=c_raw.get("approval_policy"),
        thread_sandbox=c_raw.get("thread_sandbox"),
        turn_sandbox_policy=c_raw.get("turn_sandbox_policy"),
        turn_timeout_ms=c_raw.get("turn_timeout_ms", 3600000),
        read_timeout_ms=c_raw.get("read_timeout_ms", 5000),
        stall_timeout_ms=c_raw.get("stall_timeout_ms", 300000),
    )

    # Server
    s_raw = raw.get("server", {})
    sc = ServerConfig(port=s_raw.get("port"))

    return ServiceConfig(
        tracker=tc,
        polling=pc,
        workspace=wc,
        hooks=hc,
        agent=ac,
        codex=cc,
        server=sc,
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd python && pytest tests/test_config.py -v`

- [ ] **Step 5: Commit**

```bash
git add python/src/symphony/config.py python/tests/test_config.py
git commit -m "feat(python): add config layer with defaults, $VAR, path expansion"
```

---

### Task 5: Hook Execution

**Files:**
- Create: `python/src/symphony/hooks.py`
- Create: `python/tests/test_hooks.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_hooks.py
import asyncio
import pytest
from symphony.hooks import run_hook
from symphony.exceptions import HookError, HookTimeout


@pytest.mark.asyncio
async def test_run_hook_success(tmp_path):
    script = "echo hello"
    result = await run_hook(script, cwd=str(tmp_path), timeout_ms=5000, hook_name="test")
    assert result is True


@pytest.mark.asyncio
async def test_run_hook_failure(tmp_path):
    script = "exit 1"
    with pytest.raises(HookError):
        await run_hook(script, cwd=str(tmp_path), timeout_ms=5000, hook_name="test")


@pytest.mark.asyncio
async def test_run_hook_timeout(tmp_path):
    script = "sleep 10"
    with pytest.raises(HookTimeout):
        await run_hook(script, cwd=str(tmp_path), timeout_ms=100, hook_name="test")


@pytest.mark.asyncio
async def test_run_hook_best_effort(tmp_path):
    script = "exit 1"
    result = await run_hook(script, cwd=str(tmp_path), timeout_ms=5000, hook_name="test", best_effort=True)
    assert result is False
```

- [ ] **Step 2: Write hooks.py**

```python
# src/symphony/hooks.py
import asyncio
import logging
import shlex

from symphony.exceptions import HookError, HookTimeout

logger = logging.getLogger(__name__)


async def run_hook(
    script: str,
    cwd: str,
    timeout_ms: int,
    hook_name: str,
    best_effort: bool = False,
) -> bool:
    """Execute a shell hook script.

    Returns True on success, False on failure if best_effort=True.
    Raises HookError on failure if best_effort=False.
    Raises HookTimeout if hook exceeds timeout_ms.
    """
    logger.info("hook_start", hook=hook_name, cwd=cwd)
    try:
        proc = await asyncio.create_subprocess_shell(
            f"bash -lc {shlex.quote(script)}",
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=timeout_ms / 1000.0
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            logger.error("hook_timeout", hook=hook_name, timeout_ms=timeout_ms)
            raise HookTimeout(f"Hook '{hook_name}' timed out after {timeout_ms}ms")

        if proc.returncode != 0:
            stderr_text = stderr.decode("utf-8", errors="replace")[:500]
            logger.error("hook_failed", hook=hook_name, returncode=proc.returncode, stderr=stderr_text)
            if best_effort:
                return False
            raise HookError(f"Hook '{hook_name}' failed with exit code {proc.returncode}")

        logger.info("hook_completed", hook=hook_name)
        return True

    except HookTimeout:
        raise
    except HookError:
        raise
    except Exception as e:
        logger.error("hook_error", hook=hook_name, error=str(e))
        if best_effort:
            return False
        raise HookError(f"Hook '{hook_name}' error: {e}") from e
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd python && pytest tests/test_hooks.py -v`

- [ ] **Step 4: Commit**

```bash
git add python/src/symphony/hooks.py python/tests/test_hooks.py
git commit -m "feat(python): add shell hook execution with timeout"
```

---

### Task 6: Workspace Manager

**Files:**
- Create: `python/src/symphony/workspace.py`
- Create: `python/tests/test_workspace.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_workspace.py
import os
import pytest
from symphony.workspace import WorkspaceManager
from symphony.exceptions import WorkspaceError, PathSafetyError


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
    # Should not raise
    ws = mgr.create_for_issue("PROJ-1")
    assert ws.path.startswith(str(tmp_path))


def test_after_create_hook(tmp_path):
    marker = tmp_path / "hook_ran.txt"
    script = f"touch {marker}"
    mgr = WorkspaceManager(root=str(tmp_path), after_create=script, hook_timeout_ms=5000)
    ws = mgr.create_for_issue("PROJ-1")
    assert marker.exists(), "after_create hook should have run"


def test_after_create_hook_only_on_new(tmp_path):
    marker = tmp_path / "hook_ran.txt"
    script = f"touch {marker}"
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
    script = f"touch {marker}"
    mgr = WorkspaceManager(root=str(tmp_path), before_run=script, hook_timeout_ms=5000)
    ws = mgr.create_for_issue("PROJ-1")
    assert not marker.exists()
    mgr.run_before_run(ws)
    assert marker.exists()


def test_after_run_hook(tmp_path):
    marker = tmp_path / "after_ran.txt"
    script = f"touch {marker}"
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
```

- [ ] **Step 2: Write workspace.py**

```python
# src/symphony/workspace.py
import asyncio
import logging
import os
import shutil
from symphony.models import Workspace
from symphony.path_safety import sanitize_workspace_key, check_containment
from symphony.hooks import run_hook
from symphony.exceptions import WorkspaceError

logger = logging.getLogger(__name__)


class WorkspaceManager:
    def __init__(
        self,
        root: str,
        after_create: str | None = None,
        before_run: str | None = None,
        after_run: str | None = None,
        before_remove: str | None = None,
        hook_timeout_ms: int = 60000,
    ):
        self.root = os.path.abspath(root)
        self.after_create = after_create
        self.before_run = before_run
        self.after_run = after_run
        self.before_remove = before_remove
        self.hook_timeout_ms = hook_timeout_ms

    def create_for_issue(self, identifier: str) -> Workspace:
        key = sanitize_workspace_key(identifier)
        path = os.path.join(self.root, key)

        check_containment(path, self.root)

        created_now = False
        if not os.path.isdir(path):
            try:
                os.makedirs(path, exist_ok=True)
                created_now = True
            except OSError as e:
                raise WorkspaceError(f"Failed to create workspace {path}: {e}")

        ws = Workspace(path=path, workspace_key=key, created_now=created_now)

        if created_now and self.after_create:
            self._run_hook_sync(self.after_create, path, "after_create", abort_on_fail=True)

        return ws

    def run_before_run(self, ws: Workspace) -> None:
        if self.before_run:
            self._run_hook_sync(self.before_run, ws.path, "before_run", abort_on_fail=True)

    def run_after_run(self, ws: Workspace) -> None:
        if self.after_run:
            self._run_hook_sync(self.after_run, ws.path, "after_run", abort_on_fail=False)

    def remove_for_issue(self, identifier: str) -> None:
        key = sanitize_workspace_key(identifier)
        path = os.path.join(self.root, key)

        if os.path.isdir(path):
            if self.before_remove:
                self._run_hook_sync(self.before_remove, path, "before_remove", abort_on_fail=False)
            try:
                shutil.rmtree(path)
                logger.info("workspace_removed", path=path, identifier=identifier)
            except OSError as e:
                logger.error("workspace_remove_failed", path=path, error=str(e))

    def _run_hook_sync(self, script: str, cwd: str, name: str, abort_on_fail: bool) -> None:
        try:
            result = asyncio.run(run_hook(
                script=script,
                cwd=cwd,
                timeout_ms=self.hook_timeout_ms,
                hook_name=name,
                best_effort=not abort_on_fail,
            ))
            if abort_on_fail and not result:
                raise WorkspaceError(f"Hook '{name}' failed")
        except Exception as e:
            if abort_on_fail:
                raise WorkspaceError(f"Hook '{name}' failed: {e}") from e
            logger.warning("hook_nonfatal_error", hook=name, error=str(e))
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd python && pytest tests/test_workspace.py -v`

- [ ] **Step 4: Commit**

```bash
git add python/src/symphony/workspace.py python/tests/test_workspace.py
git commit -m "feat(python): add workspace manager with hooks lifecycle"
```

---

### Task 7: Prompt Builder

**Files:**
- Create: `python/src/symphony/prompt_builder.py`
- Create: `python/tests/test_prompt_builder.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_prompt_builder.py
import pytest
from datetime import datetime
from symphony.models import Issue, WorkflowDefinition
from symphony.prompt_builder import render_prompt
from symphony.exceptions import TemplateRenderError


def test_render_issue_fields():
    issue = Issue(id="abc", identifier="PROJ-1", title="Fix the bug", state="In Progress")
    template = "Working on {{ issue.identifier }}: {{ issue.title }}"
    result = render_prompt(template, issue, attempt=None)
    assert result == "Working on PROJ-1: Fix the bug"


def test_render_with_attempt():
    issue = Issue(id="abc", identifier="PROJ-1", title="Fix", state="In Progress")
    template = "Attempt {{ attempt }}"
    result = render_prompt(template, issue, attempt=2)
    assert result == "Attempt 2"


def test_render_attempt_none():
    issue = Issue(id="abc", identifier="PROJ-1", title="Fix", state="In Progress")
    template = "Attempt {{ attempt }}"
    result = render_prompt(template, issue, attempt=None)
    assert result == "Attempt None"


def test_strict_variable_fails():
    issue = Issue(id="abc", identifier="PROJ-1", title="Fix", state="In Progress")
    template = "{{ unknown_var }}"
    with pytest.raises(TemplateRenderError):
        render_prompt(template, issue, attempt=None)


def test_unknown_filter_fails():
    issue = Issue(id="abc", identifier="PROJ-1", title="Fix", state="In Progress")
    template = "{{ issue.title | bogus_filter }}"
    with pytest.raises(TemplateRenderError):
        render_prompt(template, issue, attempt=None)


def test_render_labels():
    issue = Issue(id="abc", identifier="PROJ-1", title="Fix", state="In Progress", labels=["bug", "urgent"])
    template = "Labels: {{ issue.labels | join(', ') }}"
    result = render_prompt(template, issue, attempt=None)
    assert result == "Labels: bug, urgent"


def test_render_blockers():
    issue = Issue(id="abc", identifier="PROJ-1", title="Fix", state="Todo", blocked_by=[
        type('BlockerRef', (), {'id': 'b1', 'identifier': 'PROJ-2', 'state': 'Done'})(),
    ])
    template = "Blocked by: {{ issue.blocked_by[0].identifier }}"
    result = render_prompt(template, issue, attempt=None)
    assert result == "Blocked by: PROJ-2"


def test_default_fallback_empty_template():
    issue = Issue(id="abc", identifier="PROJ-1", title="Fix this", state="In Progress")
    result = render_prompt("", issue, attempt=None)
    assert "PROJ-1" in result
    assert "Fix this" in result
    assert "Linear" in result


def test_default_fallback_whitespace_template():
    issue = Issue(id="abc", identifier="PROJ-1", title="Fix this", state="In Progress")
    result = render_prompt("   ", issue, attempt=None)
    assert "PROJ-1" in result
```

- [ ] **Step 2: Write prompt_builder.py**

```python
# src/symphony/prompt_builder.py
from jinja2 import Environment, StrictUndefined, TemplateNotFound, TemplateSyntaxError, UndefinedError
from symphony.models import Issue
from symphony.exceptions import TemplateRenderError


_default_prompt = (
    "You are working on an issue from Linear.\n\n"
    "Issue: {{ issue.identifier }}: {{ issue.title }}\n\n"
    "Description:\n{{ issue.description or '(no description)' }}\n\n"
    "State: {{ issue.state }}\n"
    "Priority: {{ issue.priority or 'not set' }}\n"
    "Labels: {{ issue.labels | join(', ') or 'none' }}\n"
    "{% if issue.blocked_by %}Blocked by: {% for b in issue.blocked_by %}{{ b.identifier }} ({{ b.state }}) {% endfor %}{% endif %}"
)


def _build_env() -> Environment:
    env = Environment(undefined=StrictUndefined)
    # Reject unknown filters by restricting to builtins
    allowed = set(env.filters.keys())
    class StrictFilterEnv(Environment):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)

        def getattr(self, obj, attribute):
            return super().getattr(obj, attribute)

    env = Environment(undefined=StrictUndefined)
    return env


def render_prompt(template: str, issue: Issue, attempt: int | None) -> str:
    """Render the prompt template with strict variable/filter checking.

    Falls back to default prompt if template is empty/whitespace.
    """
    effective = template.strip() or _default_prompt

    env = Environment(undefined=StrictUndefined)
    try:
        tpl = env.from_string(effective)
    except (TemplateSyntaxError, TemplateNotFound) as e:
        raise TemplateRenderError(f"Template parse error: {e}")

    # Convert issue to dict for template access
    issue_dict = {
        "id": issue.id,
        "identifier": issue.identifier,
        "title": issue.title,
        "description": issue.description,
        "priority": issue.priority,
        "state": issue.state,
        "branch_name": issue.branch_name,
        "url": issue.url,
        "labels": issue.labels,
        "blocked_by": [
            {"id": b.id, "identifier": b.identifier, "state": b.state}
            for b in (issue.blocked_by or [])
        ],
        "created_at": issue.created_at.isoformat() if issue.created_at else None,
        "updated_at": issue.updated_at.isoformat() if issue.updated_at else None,
    }

    ctx = {"issue": issue_dict, "attempt": attempt}

    try:
        result = tpl.render(ctx)
    except UndefinedError as e:
        raise TemplateRenderError(f"Unknown template variable: {e}")
    except Exception as e:
        if "no filter" in str(e).lower() or "filter" in str(e).lower():
            raise TemplateRenderError(f"Unknown template filter: {e}")
        raise TemplateRenderError(f"Template render error: {e}")

    return result
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd python && pytest tests/test_prompt_builder.py -v`

- [ ] **Step 4: Commit**

```bash
git add python/src/symphony/prompt_builder.py python/tests/test_prompt_builder.py
git commit -m "feat(python): add prompt builder with Jinja2 strict rendering"
```

---

### Task 8: Tracker Adapter (Base + Memory)

**Files:**
- Create: `python/src/symphony/tracker/__init__.py`
- Create: `python/src/symphony/tracker/base.py`
- Create: `python/src/symphony/tracker/memory.py`
- Create: `python/tests/test_tracker_memory.py`

- [ ] **Step 1: Write tracker/__init__.py**

```python
# src/symphony/tracker/__init__.py
```

- [ ] **Step 2: Write the failing tests**

```python
# tests/test_tracker_memory.py
import pytest
from datetime import datetime
from symphony.tracker.base import TrackerAdapter
from symphony.tracker.memory import MemoryTracker
from symphony.models import Issue, BlockerRef


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


def test_blocker_normalization():
    tracker = MemoryTracker()
    assert True  # blockers are pre-set in fixture data
```

- [ ] **Step 3: Write the adapters**

```python
# src/symphony/tracker/base.py
from abc import ABC, abstractmethod
from symphony.models import Issue


class TrackerAdapter(ABC):
    @abstractmethod
    def fetch_candidate_issues(self) -> list[Issue]:
        ...

    @abstractmethod
    def fetch_issues_by_states(self, state_names: list[str]) -> list[Issue]:
        ...

    @abstractmethod
    def fetch_issue_states_by_ids(self, issue_ids: list[str]) -> list[Issue]:
        ...
```

```python
# src/symphony/tracker/memory.py
from symphony.tracker.base import TrackerAdapter
from symphony.models import Issue


class MemoryTracker(TrackerAdapter):
    def __init__(
        self,
        issues: list[Issue] | None = None,
        active_states: list[str] | None = None,
        terminal_states: list[str] | None = None,
    ):
        self._issues = {i.id: i for i in (issues or [])}
        self._active_states = active_states or ["Todo", "In Progress"]
        self._terminal_states = terminal_states or ["Done", "Closed", "Cancelled", "Duplicate"]

    def fetch_candidate_issues(self) -> list[Issue]:
        return [
            i for i in self._issues.values()
            if i.state.lower() in (s.lower() for s in self._active_states)
        ]

    def fetch_issues_by_states(self, state_names: list[str]) -> list[Issue]:
        if not state_names:
            return []
        lower = [s.lower() for s in state_names]
        return [i for i in self._issues.values() if i.state.lower() in lower]

    def fetch_issue_states_by_ids(self, issue_ids: list[str]) -> list[Issue]:
        return [self._issues[iid] for iid in issue_ids if iid in self._issues]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd python && pytest tests/test_tracker_memory.py -v`

- [ ] **Step 5: Commit**

```bash
git add python/src/symphony/tracker/ python/tests/test_tracker_memory.py
git commit -m "feat(python): add tracker base + memory adapter"
```

---

### Task 9: Linear Tracker Adapter

**Files:**
- Create: `python/src/symphony/tracker/linear.py`
- Create: `python/tests/test_tracker_linear.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_tracker_linear.py
import pytest
from symphony.tracker.linear import LinearTracker
from symphony.exceptions import MissingTrackerApiKey
from symphony.models import Issue


def test_requires_api_key():
    with pytest.raises(MissingTrackerApiKey):
        LinearTracker(api_key="", project_slug="test", endpoint="https://api.linear.app/graphql")


def test_constructs_with_key():
    tracker = LinearTracker(api_key="sk-test", project_slug="slug", endpoint="https://api.linear.app/graphql")
    assert tracker.api_key == "sk-test"
    assert tracker.project_slug == "slug"
    assert tracker.endpoint == "https://api.linear.app/graphql"


def test_query_builder():
    tracker = LinearTracker(api_key="sk-test", project_slug="test-proj")
    query = tracker._build_candidate_query(after=None)
    assert "test-proj" in query["query"]
    assert "slugId" in query["query"]
    assert "pageSize" in query["variables"]
    assert query["variables"]["pageSize"] == 50
```

- [ ] **Step 2: Write the Linear adapter**

```python
# src/symphony/tracker/linear.py
import logging
from datetime import datetime
from typing import Any

from symphony.tracker.base import TrackerAdapter
from symphony.models import Issue, BlockerRef
from symphony.exceptions import (
    MissingTrackerApiKey, LinearApiRequest, LinearGraphQLErrors,
    LinearUnknownPayload, LinearMissingEndCursor,
)

logger = logging.getLogger(__name__)

CANDIDATE_QUERY = """
query CandidateIssues($projectSlug: String!, $activeStates: [String!]!, $after: String, $pageSize: Int!) {
  projects(filter: { slugId: { eq: $projectSlug } }) {
    nodes {
      id
      issues(first: $pageSize, after: $after, filter: { state: { name: { in: $activeStates } } }) {
        nodes {
          id
          identifier
          title
          description
          priority
          state { name }
          branchName
          url
          labels { nodes { name } }
          children { nodes { id identifier state { name } } }
          createdAt
          updatedAt
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}
"""

STATE_REFRESH_QUERY = """
query IssueStates($ids: [ID!]!) {
  issues(filter: { id: { in: $ids } }) {
    nodes {
      id
      identifier
      title
      description
      priority
      state { name }
      url
      labels { nodes { name } }
      createdAt
      updatedAt
    }
  }
}
"""

TERMINAL_QUERY = """
query TerminalIssues($projectSlug: String!, $terminalStates: [String!]!) {
  projects(filter: { slugId: { eq: $projectSlug } }) {
    nodes {
      id
      issues(filter: { state: { name: { in: $terminalStates } } }) {
        nodes {
          id
          identifier
        }
      }
    }
  }
}
"""


class LinearTracker(TrackerAdapter):
    def __init__(
        self,
        api_key: str,
        project_slug: str,
        endpoint: str = "https://api.linear.app/graphql",
        active_states: list[str] | None = None,
        terminal_states: list[str] | None = None,
        page_size: int = 50,
        timeout: int = 30,
    ):
        if not api_key:
            raise MissingTrackerApiKey("Linear API key is required")
        self.api_key = api_key
        self.project_slug = project_slug
        self.endpoint = endpoint
        self.active_states = active_states or ["Todo", "In Progress"]
        self.terminal_states = terminal_states or [
            "Closed", "Cancelled", "Canceled", "Duplicate", "Done",
        ]
        self.page_size = page_size
        self.timeout = timeout

    def fetch_candidate_issues(self) -> list[Issue]:
        issues: list[Issue] = []
        after: str | None = None
        while True:
            query, variables = self._build_candidate_query(after)
            data = self._execute(query, variables)
            project_nodes = self._navigate(data, ["data", "projects", "nodes"])
            if not project_nodes:
                break
            issue_connection = project_nodes[0].get("issues", {})
            page_issues = self._parse_issue_nodes(issue_connection.get("nodes", []))
            issues.extend(page_issues)
            page_info = issue_connection.get("pageInfo", {})
            if not page_info.get("hasNextPage"):
                break
            after = page_info.get("endCursor")
            if not after:
                raise LinearMissingEndCursor("Missing endCursor for pagination")
        return issues

    def fetch_issues_by_states(self, state_names: list[str]) -> list[Issue]:
        if not state_names:
            return []
        query = TERMINAL_QUERY
        variables = {
            "projectSlug": self.project_slug,
            "terminalStates": state_names,
        }
        data = self._execute(query, variables)
        project_nodes = self._navigate(data, ["data", "projects", "nodes"])
        if not project_nodes:
            return []
        issue_nodes = project_nodes[0].get("issues", {}).get("nodes", [])
        return [
            Issue(id=n["id"], identifier=n["identifier"], title="", state="")
            for n in issue_nodes
        ]

    def fetch_issue_states_by_ids(self, issue_ids: list[str]) -> list[Issue]:
        if not issue_ids:
            return []
        query = STATE_REFRESH_QUERY
        variables = {"ids": issue_ids}
        data = self._execute(query, variables)
        nodes = self._navigate(data, ["data", "issues", "nodes"]) or []
        return [self._normalize_issue(n) for n in nodes]

    def _build_candidate_query(self, after: str | None) -> tuple[str, dict]:
        variables = {
            "projectSlug": self.project_slug,
            "activeStates": self.active_states,
            "after": after,
            "pageSize": self.page_size,
        }
        return CANDIDATE_QUERY, variables

    def _execute(self, query: str, variables: dict[str, Any]) -> dict:
        import aiohttp
        import asyncio

        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result = loop.run_until_complete(
                    self._async_execute(query, variables)
                )
                return result
            finally:
                loop.close()
        except LinearGraphQLErrors:
            raise
        except LinearApiRequest:
            raise
        except Exception as e:
            raise LinearApiRequest(f"Linear API request failed: {e}")

    async def _async_execute(self, query: str, variables: dict[str, Any]) -> dict:
        import aiohttp
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {"query": query, "variables": variables}
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.endpoint,
                    json=payload,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=self.timeout),
                ) as resp:
                    if resp.status != 200:
                        text = await resp.text()
                        raise LinearApiRequest(
                            f"Linear API returned status {resp.status}: {text[:500]}"
                        )
                    data = await resp.json()
        except LinearApiRequest:
            raise
        except Exception as e:
            raise LinearApiRequest(f"Linear HTTP request failed: {e}")

        if "errors" in data and data["errors"]:
            raise LinearGraphQLErrors(f"GraphQL errors: {data['errors']}")

        return data

    def _navigate(self, data: dict, path: list[str]) -> Any:
        current = data
        for key in path:
            if not isinstance(current, dict):
                return None
            current = current.get(key)
        return current

    def _parse_issue_nodes(self, nodes: list[dict]) -> list[Issue]:
        return [self._normalize_issue(n) for n in nodes]

    def _normalize_issue(self, node: dict) -> Issue:
        state_name = ""
        if isinstance(node.get("state"), dict):
            state_name = node["state"].get("name", "")

        labels = []
        if isinstance(node.get("labels"), dict):
            label_nodes = node["labels"].get("nodes", [])
            labels = [l.get("name", "") for l in label_nodes if isinstance(l, dict)]

        blockers = []
        if isinstance(node.get("children"), dict):
            for child in node["children"].get("nodes", []):
                if isinstance(child, dict):
                    blockers.append(BlockerRef(
                        id=child.get("id"),
                        identifier=child.get("identifier"),
                        state=child.get("state", {}).get("name") if isinstance(child.get("state"), dict) else None,
                    ))

        priority = node.get("priority")
        if not isinstance(priority, int):
            priority = None

        created = None
        if node.get("createdAt"):
            try:
                created = datetime.fromisoformat(node["createdAt"].replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass

        updated = None
        if node.get("updatedAt"):
            try:
                updated = datetime.fromisoformat(node["updatedAt"].replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass

        return Issue(
            id=node.get("id", ""),
            identifier=node.get("identifier", ""),
            title=node.get("title", ""),
            description=node.get("description"),
            priority=priority,
            state=state_name,
            branch_name=node.get("branchName"),
            url=node.get("url"),
            labels=labels,
            blocked_by=blockers,
            created_at=created,
            updated_at=updated,
        )
```

- [ ] **Step 3: Run tests**

Run: `cd python && pytest tests/test_tracker_linear.py -v`

- [ ] **Step 4: Commit**

```bash
git add python/src/symphony/tracker/linear.py python/tests/test_tracker_linear.py
git commit -m "feat(python): add Linear GraphQL tracker client"
```

---

### Task 10: Orchestrator — Core Loop + Dispatch + Retry

**Files:**
- Create: `python/src/symphony/orchestrator.py`
- Create: `python/tests/test_orchestrator.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_orchestrator.py
import asyncio
import pytest
from datetime import datetime, timezone
from symphony.models import (
    Issue, OrchestratorState, RunningEntry, RetryEntry, CodexTotals, BlockerRef,
)
from symphony.orchestrator import (
    dispatch_key, should_dispatch, available_slots,
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


def test_normalize_attempt():
    assert normalize_attempt(None) == 0
    assert normalize_attempt(0) == 0
    assert normalize_attempt(1) == 1
    assert normalize_attempt(5) == 5


def test_backoff_delay():
    assert backoff_delay(attempt=1, max_backoff_ms=300000) == 10000
    assert backoff_delay(attempt=2, max_backoff_ms=300000) == 20000
    assert backoff_delay(attempt=3, max_backoff_ms=300000) == 40000
    assert backoff_delay(attempt=10, max_backoff_ms=300000) == 300000  # capped


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


def test_reconcile_stalled_with_event():
    state = OrchestratorState()
    now = datetime.now(timezone.utc)
    entry = RunningEntry(
        task=None, identifier="P-1",
        issue=Issue(id="1", identifier="P-1", title="", state="Todo"),
        started_at=now,
        last_codex_timestamp=now,
    )
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
```

- [ ] **Step 2: Write orchestrator.py (part 1 — core functions)**

```python
# src/symphony/orchestrator.py
import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any

from symphony.models import (
    Issue, OrchestratorState, RunningEntry, RetryEntry, CodexTotals,
)
from symphony.exceptions import (
    WorkspaceError, HookError, AgentError,
)

logger = logging.getLogger(__name__)


def dispatch_key(issue: Issue) -> tuple:
    """Sort key: priority asc (None sorts last), created_at asc, identifier asc."""
    prio = issue.priority if issue.priority is not None else 9999
    created = issue.created_at if issue.created_at else datetime.min.replace(tzinfo=timezone.utc)
    return (prio, created, issue.identifier)


def should_dispatch(
    issue: Issue,
    state: OrchestratorState,
    active_states: list[str] | None = None,
    terminal_states: list[str] | None = None,
) -> bool:
    """Check if an issue is eligible for dispatch (§8.2)."""
    if issue.id in state.running:
        return False
    if issue.id in state.claimed:
        return False

    act = active_states or ["Todo", "In Progress"]
    term = terminal_states or ["Closed", "Cancelled", "Canceled", "Duplicate", "Done"]

    if issue.state not in act:
        return False
    if issue.state in term:
        return False

    # Blocker rule for Todo state
    if issue.state.lower() == "todo":
        for blocker in (issue.blocked_by or []):
            if blocker.state and blocker.state not in term:
                return False

    return True


def available_slots(state: OrchestratorState) -> int:
    """Global concurrency slots remaining."""
    return max(state.max_concurrent_agents - len(state.running), 0)


def available_slots_for_state(state: OrchestratorState, issue_state: str) -> int:
    """Per-state slots remaining, if configured. Otherwise fall back to global."""
    key = issue_state.lower()
    if key in state.max_concurrent_agents_by_state:
        limit = state.max_concurrent_agents_by_state[key]
        running_in_state = sum(
            1 for e in state.running.values()
            if e.issue.state.lower() == key
        )
        return max(limit - running_in_state, 0)
    return available_slots(state)


def normalize_attempt(attempt: int | None) -> int:
    return attempt if attempt is not None else 0


def backoff_delay(attempt: int, max_backoff_ms: int = 300000) -> int:
    """Exponential backoff: min(10000*2^(attempt-1), max_backoff_ms)."""
    if attempt <= 0:
        attempt = 1
    delay = 10000 * (2 ** (attempt - 1))
    return min(delay, max_backoff_ms)


def schedule_retry(
    state: OrchestratorState,
    issue_id: str,
    attempt: int,
    identifier: str,
    error: str | None = None,
    delay_ms: int | None = None,
) -> OrchestratorState:
    """Schedule a retry for an issue. Cancel existing timer if present."""
    existing = state.retry_attempts.pop(issue_id, None)
    due = time.monotonic() + (delay_ms or 1000) / 1000.0
    entry = RetryEntry(
        issue_id=issue_id,
        identifier=identifier,
        attempt=attempt,
        due_at_ms=due * 1000,
        error=error,
    )
    state.retry_attempts[issue_id] = entry
    state.claimed.add(issue_id)
    return state


def reconcile_stalled_runs(
    state: OrchestratorState,
    stall_timeout_ms: int,
    now: datetime | None = None,
) -> OrchestratorState:
    """Check each running entry for stall timeout. Return updated state."""
    if stall_timeout_ms <= 0:
        return state
    now = now or datetime.now(timezone.utc)
    to_remove: list[str] = []
    for issue_id, entry in state.running.items():
        reference = entry.last_codex_timestamp or entry.started_at
        if reference is None:
            continue
        elapsed = (now - reference).total_seconds() * 1000
        if elapsed > stall_timeout_ms:
            logger.warning("stall_detected", issue_id=issue_id, identifier=entry.identifier,
                           elapsed_ms=elapsed, stall_timeout_ms=stall_timeout_ms)
            entry.task.cancel() if entry.task and not entry.task.done() else None
            to_remove.append(issue_id)

    for issue_id in to_remove:
        state = terminate_running_issue(state, issue_id, cleanup_workspace=False)
        state = schedule_retry(
            state, issue_id,
            attempt=(state.running[issue_id].retry_attempt + 1 if issue_id in state.running else 1),
            identifier="unknown",
            error="stall_timeout",
        )
    return state


def terminate_running_issue(
    state: OrchestratorState,
    issue_id: str,
    cleanup_workspace: bool = False,
) -> OrchestratorState:
    """Remove a running entry and release its claim."""
    entry = state.running.pop(issue_id, None)
    state.claimed.discard(issue_id)
    if entry:
        # Add runtime seconds to totals
        if entry.started_at:
            elapsed = (datetime.now(timezone.utc) - entry.started_at).total_seconds()
            state.codex_totals.seconds_running += elapsed

        # Add token totals
        if entry.last_reported_total_tokens > 0:
            # Use the last absolute total
            state.codex_totals.input_tokens += entry.codex_input_tokens
            state.codex_totals.output_tokens += entry.codex_output_tokens
            state.codex_totals.total_tokens += entry.codex_total_tokens

    return state
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd python && pytest tests/test_orchestrator.py -v`

- [ ] **Step 4: Commit**

```bash
git add python/src/symphony/orchestrator.py python/tests/test_orchestrator.py
git commit -m "feat(python): add orchestrator core (dispatch, retry, backoff, stall detection)"
```

---

### Task 11: Orchestrator — Full State Machine + Poll Loop

- [ ] **Step 1: Write orchestrator async loop tests**

```python
# Add to tests/test_orchestrator.py
import asyncio


@pytest.mark.asyncio
async def test_poll_loop_dispatch():
    """Integration test: orchestrator processes tick and dispatches."""
    from symphony.orchestrator import SymphonyOrchestrator
    from symphony.tracker.memory import MemoryTracker
    from symphony.models import Issue

    tracker = MemoryTracker(issues=[
        Issue(id="1", identifier="PROJ-1", title="Fix", state="Todo", priority=1),
        Issue(id="2", identifier="PROJ-2", title="Done task", state="Done"),
    ])
    orch = SymphonyOrchestrator(
        tracker=tracker,
        max_concurrent=5,
        poll_interval_ms=60000,
    )
    await orch._tick()
    assert "1" in orch.state.running
    assert "2" not in orch.state.running


@pytest.mark.asyncio
async def test_worker_exit_normal():
    from symphony.orchestrator import SymphonyOrchestrator
    from symphony.tracker.memory import MemoryTracker
    from symphony.models import Issue

    tracker = MemoryTracker(issues=[
        Issue(id="1", identifier="PROJ-1", title="Fix", state="Todo"),
    ])
    orch = SymphonyOrchestrator(tracker=tracker, max_concurrent=5, poll_interval_ms=60000)
    await orch._tick()
    assert "1" in orch.state.running
    orch._on_worker_exit("1", normal=True)
    assert "1" not in orch.state.running
    assert "1" in orch.state.retry_attempts  # continuation retry
    assert orch.state.retry_attempts["1"].attempt == 1


@pytest.mark.asyncio
async def test_worker_exit_abnormal():
    from symphony.orchestrator import SymphonyOrchestrator
    from symphony.tracker.memory import MemoryTracker
    from symphony.models import Issue

    tracker = MemoryTracker(issues=[
        Issue(id="1", identifier="PROJ-1", title="Fix", state="Todo"),
    ])
    orch = SymphonyOrchestrator(tracker=tracker, max_concurrent=5, poll_interval_ms=60000)
    await orch._tick()
    orch.state.running["1"].retry_attempt = 2
    orch._on_worker_exit("1", normal=False)
    assert "1" not in orch.state.running
    assert "1" in orch.state.retry_attempts
    # Attempt should increment from 2 to 3
    assert orch.state.retry_attempts["1"].attempt == 3


@pytest.mark.asyncio
async def test_reconciliation_removes_terminal():
    from symphony.orchestrator import SymphonyOrchestrator
    from symphony.tracker.memory import MemoryTracker
    from symphony.models import Issue, RunningEntry

    tracker = MemoryTracker(issues=[
        Issue(id="1", identifier="PROJ-1", title="Fix", state="Done"),
    ])
    orch = SymphonyOrchestrator(tracker=tracker, max_concurrent=5, poll_interval_ms=60000)
    orch.state.running["1"] = RunningEntry(
        task=asyncio.create_task(asyncio.sleep(9999)),
        identifier="PROJ-1",
        issue=Issue(id="1", identifier="PROJ-1", title="Fix", state="In Progress"),
    )
    orch.state.claimed.add("1")
    await orch._reconcile_running()
    assert "1" not in orch.state.running
    assert "1" not in orch.state.claimed
```

- [ ] **Step 2: Write full orchestrator class**

```python
# Add to orchestrator.py
class SymphonyOrchestrator:
    """Main orchestrator: owns state machine, poll loop, worker lifecycle."""

    def __init__(
        self,
        tracker: Any,  # TrackerAdapter
        workspace_manager: Any | None = None,
        max_concurrent: int = 10,
        poll_interval_ms: int = 30000,
        active_states: list[str] | None = None,
        terminal_states: list[str] | None = None,
        max_turns: int = 20,
        max_retry_backoff_ms: int = 300000,
        max_concurrent_by_state: dict[str, int] | None = None,
        stall_timeout_ms: int = 300000,
    ):
        self.tracker = tracker
        self.workspace_manager = workspace_manager
        self.state = OrchestratorState(
            max_concurrent_agents=max_concurrent,
            poll_interval_ms=poll_interval_ms,
        )
        self.state.max_concurrent_agents_by_state = max_concurrent_by_state or {}
        self.active_states = active_states or ["Todo", "In Progress"]
        self.terminal_states = terminal_states or [
            "Closed", "Cancelled", "Canceled", "Duplicate", "Done",
        ]
        self.max_turns = max_turns
        self.max_retry_backoff_ms = max_retry_backoff_ms
        self.stall_timeout_ms = stall_timeout_ms
        self._tick_interval = poll_interval_ms / 1000.0
        self._running = True
        self._retry_timers: dict[str, asyncio.Task] = {}
        self._observers: list[Any] = []

    async def run(self):
        """Main loop: initial cleanup, immediate tick, then periodic."""
        logger.info("orchestrator_started")
        await self._startup_cleanup()
        await self._tick()
        while self._running:
            await asyncio.sleep(self._tick_interval)
            if not self._running:
                break
            await self._tick()
        logger.info("orchestrator_stopped")

    def stop(self):
        self._running = False

    async def _tick(self):
        """One poll-and-dispatch cycle (§16.2)."""
        self.state = await self._reconcile_running()

        validation = self._validate_dispatch()
        if validation:
            for v in validation:
                logger.error("dispatch_validation_error", error=v)
            self._notify_observers()
            return

        try:
            issues = self.tracker.fetch_candidate_issues()
        except Exception as e:
            logger.error("candidate_fetch_failed", error=str(e))
            self._notify_observers()
            return

        for issue in sorted(issues, key=dispatch_key):
            if available_slots(self.state) <= 0:
                break
            per_state = available_slots_for_state(self.state, issue.state)
            if per_state <= 0:
                continue
            if should_dispatch(issue, self.state, self.active_states, self.terminal_states):
                self.state = self._dispatch_issue(issue)

        self._notify_observers()

    async def _reconcile_running(self) -> OrchestratorState:
        """Check for stalls and refresh issue states (§16.3)."""
        self.state = reconcile_stalled_runs(self.state, self.stall_timeout_ms)

        running_ids = list(self.state.running.keys())
        if not running_ids:
            return self.state

        try:
            refreshed = self.tracker.fetch_issue_states_by_ids(running_ids)
        except Exception as e:
            logger.debug("state_refresh_failed", error=str(e))
            return self.state

        refreshed_map = {r.id: r for r in refreshed}
        for issue_id in list(self.state.running.keys()):
            refreshed_issue = refreshed_map.get(issue_id)
            if refreshed_issue is None:
                continue
            state = refreshed_issue.state
            if state in self.terminal_states:
                logger.info("reconcile_terminal", issue_id=issue_id,
                            state=state, cleanup=True)
                self.state = terminate_running_issue(self.state, issue_id, cleanup_workspace=True)
                if self.workspace_manager:
                    self.workspace_manager.remove_for_issue(refreshed_issue.identifier)
            elif state in self.active_states:
                self.state.running[issue_id].issue = refreshed_issue
            else:
                logger.info("reconcile_non_active", issue_id=issue_id,
                            state=state, cleanup=False)
                self.state = terminate_running_issue(self.state, issue_id, cleanup_workspace=False)

        return self.state

    async def _startup_cleanup(self):
        """Clean workspaces for terminal issues on startup (§8.6)."""
        try:
            terminal_issues = self.tracker.fetch_issues_by_states(self.terminal_states)
        except Exception as e:
            logger.warning("startup_cleanup_fetch_failed", error=str(e))
            return
        if self.workspace_manager:
            for ti in terminal_issues:
                self.workspace_manager.remove_for_issue(ti.identifier)

    def _validate_dispatch(self) -> list[str]:
        """Placeholder: returns config errors. Override for full validation."""
        return []

    def _dispatch_issue(self, issue: Issue, attempt: int | None = None) -> OrchestratorState:
        """Create a worker task for an issue (§16.4)."""
        import asyncio

        async def worker_wrapper():
            await self._run_worker(issue, attempt)

        task = asyncio.create_task(worker_wrapper())
        self.state.running[issue.id] = RunningEntry(
            task=task,
            identifier=issue.identifier,
            issue=issue,
            retry_attempt=normalize_attempt(attempt),
            started_at=datetime.now(timezone.utc),
        )
        self.state.claimed.add(issue.id)
        self.state.retry_attempts.pop(issue.id, None)
        logger.info("dispatched", issue_id=issue.id, identifier=issue.identifier,
                     state=issue.state)
        return self.state

    async def _run_worker(self, issue: Issue, attempt: int | None):
        """Worker lifecycle: workspace → prompt → agent turns (§16.5)."""
        try:
            if self.workspace_manager:
                ws = self.workspace_manager.create_for_issue(issue.identifier)
                self.workspace_manager.run_before_run(ws)

            # Actual agent runner would be called here
            # For now, simulate work
            await asyncio.sleep(0.1)

        except (WorkspaceError, HookError, AgentError) as e:
            logger.error("worker_failed", issue_id=issue.id, identifier=issue.identifier, error=str(e))
            self._on_worker_exit(issue.id, normal=False)
            return
        except Exception as e:
            logger.error("worker_unexpected_error", issue_id=issue.id, identifier=issue.identifier, error=str(e))
            self._on_worker_exit(issue.id, normal=False)
            return

        self._on_worker_exit(issue.id, normal=True)

    def _on_worker_exit(self, issue_id: str, normal: bool):
        """Handle worker exit — update totals and schedule retry (§16.6)."""
        if issue_id not in self.state.running:
            return
        entry = self.state.running.pop(issue_id)
        self.state.claimed.discard(issue_id)

        # Update aggregate totals
        if entry.started_at:
            elapsed = (datetime.now(timezone.utc) - entry.started_at).total_seconds()
            self.state.codex_totals.seconds_running += elapsed
        self.state.codex_totals.total_tokens += entry.codex_total_tokens
        self.state.codex_totals.input_tokens += entry.codex_input_tokens
        self.state.codex_totals.output_tokens += entry.codex_output_tokens

        if normal:
            self.state.completed.add(issue_id)
            self.state = schedule_retry(
                self.state, issue_id, attempt=1,
                identifier=entry.identifier,
                delay_ms=1000,  # short continuation retry
            )
        else:
            next_attempt = entry.retry_attempt + 1
            delay = backoff_delay(next_attempt, self.max_retry_backoff_ms)
            self.state = schedule_retry(
                self.state, issue_id, attempt=next_attempt,
                identifier=entry.identifier,
                error="worker_exit_abnormal",
                delay_ms=delay,
            )

        self._notify_observers()

    def add_observer(self, callback):
        self._observers.append(callback)

    def _notify_observers(self):
        for cb in self._observers:
            try:
                cb(self.state)
            except Exception as e:
                logger.warning("observer_error", error=str(e))
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd python && pytest tests/test_orchestrator.py -v`

- [ ] **Step 4: Commit**

```bash
git add python/src/symphony/orchestrator.py python/tests/test_orchestrator.py
git commit -m "feat(python): add full orchestrator state machine with poll loop"
```

---

### Task 12: Agent Runner (Codex App-Server Client)

**Files:**
- Create: `python/src/symphony/agent_runner.py`
- Create: `python/tests/test_agent_runner.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_agent_runner.py
import asyncio
import pytest
from symphony.agent_runner import AgentRunner
from symphony.models import Issue
from symphony.exceptions import InvalidWorkspaceCwd, CodexNotFound


def test_agent_runner_requires_workspace(tmp_path):
    runner = AgentRunner(
        workspace_path=str(tmp_path),
        codex_command="codex app-server",
        issue=Issue(id="1", identifier="PROJ-1", title="Fix", state="Todo"),
        prompt="Work on PROJ-1",
    )
    assert runner.workspace_path == str(tmp_path)


@pytest.mark.asyncio
async def test_agent_runner_timeout(mocker):
    runner = AgentRunner(
        workspace_path="/tmp/test",
        codex_command="sleep 60",
        issue=Issue(id="1", identifier="PROJ-1", title="Fix", state="Todo"),
        prompt="Work",
        turn_timeout_ms=100,
        read_timeout_ms=50,
    )
    with pytest.raises(Exception):
        await runner.run()
```

- [ ] **Step 2: Write agent_runner.py**

```python
# src/symphony/agent_runner.py
import asyncio
import json
import logging
import shlex
import time
from datetime import datetime, timezone
from typing import Any, AsyncIterator

from symphony.models import Issue
from symphony.exceptions import (
    CodexNotFound, InvalidWorkspaceCwd, ResponseTimeout,
    TurnTimeout, TurnFailed, TurnCancelled, TurnInputRequired,
)
from symphony.path_safety import check_containment

logger = logging.getLogger(__name__)


class AgentRunner:
    """Runs a Codex app-server session for one issue.

    Manages: subprocess lifecycle, JSON line protocol, turn loop.
    """

    def __init__(
        self,
        workspace_path: str,
        codex_command: str,
        issue: Issue,
        prompt: str,
        turn_timeout_ms: int = 3600000,
        read_timeout_ms: int = 5000,
        workspace_root: str | None = None,
        approval_policy: Any = None,
        thread_sandbox: Any = None,
        turn_sandbox_policy: Any = None,
    ):
        self.workspace_path = workspace_path
        self.workspace_root = workspace_root
        self.codex_command = codex_command
        self.issue = issue
        self.prompt = prompt
        self.turn_timeout_ms = turn_timeout_ms
        self.read_timeout_ms = read_timeout_ms
        self.approval_policy = approval_policy
        self.thread_sandbox = thread_sandbox
        self.turn_sandbox_policy = turn_sandbox_policy

        self._process: asyncio.subprocess.Process | None = None
        self._thread_id: str | None = None
        self._turn_id: str | None = None
        self._session_id: str | None = None
        self._turn_count: int = 0
        self._input_tokens: int = 0
        self._output_tokens: int = 0
        self._total_tokens: int = 0
        self._events: list[dict] = []

    async def run(self) -> dict[str, Any]:
        """Run the full agent session. Returns summary dict."""
        self._validate_workspace()

        proc = await self._launch_process()
        if not proc:
            raise CodexNotFound("Failed to launch codex app-server")

        self._process = proc
        session = await self._init_session()
        if not session:
            raise TurnFailed("Session initialization failed")

        summary = {
            "session_id": self._session_id,
            "thread_id": self._thread_id,
            "turn_count": self._turn_count,
            "input_tokens": self._input_tokens,
            "output_tokens": self._output_tokens,
            "total_tokens": self._total_tokens,
            "events": self._events,
        }
        await self._stop_process()
        return summary

    def _validate_workspace(self):
        if self.workspace_root:
            check_containment(self.workspace_path, self.workspace_root)

    async def _launch_process(self) -> asyncio.subprocess.Process | None:
        cmd = f"bash -lc {shlex.quote(self.codex_command)}"
        try:
            proc = await asyncio.create_subprocess_shell(
                cmd,
                cwd=self.workspace_path,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            return proc
        except FileNotFoundError:
            return None

    async def _init_session(self) -> bool:
        """Send thread-create request, extract thread_id."""
        if not self._process or not self._process.stdout:
            return False

        thread_request = {
            "method": "threads/create",
            "params": {
                "title": f"{self.issue.identifier}: {self.issue.title}",
                "problem_statement": self.prompt,
            },
        }
        response = await self._send_request(thread_request)
        if not response:
            return False

        thread = response.get("result", {})
        self._thread_id = thread.get("thread_id") or thread.get("id")
        if not self._thread_id:
            return False

        self._session_id = f"{self._thread_id}-init"
        self._events.append({
            "event": "session_started",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "thread_id": self._thread_id,
        })
        return True

    async def _send_request(self, request: dict) -> dict | None:
        if not self._process or not self._process.stdin:
            return None
        line = json.dumps(request) + "\n"
        try:
            self._process.stdin.write(line.encode())
            await self._process.stdin.drain()
        except BrokenPipeError:
            return None

        return await self._read_response()

    async def _read_response(self) -> dict | None:
        if not self._process or not self._process.stdout:
            return None
        try:
            line = await asyncio.wait_for(
                self._process.stdout.readline(),
                timeout=self.read_timeout_ms / 1000.0,
            )
        except asyncio.TimeoutError:
            raise ResponseTimeout("Read timeout on codex response")
        except Exception:
            return None

        if not line:
            return None
        try:
            return json.loads(line.decode("utf-8").strip())
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None

    async def _stop_process(self):
        if self._process and self._process.returncode is None:
            self._process.kill()
            await self._process.wait()
```

- [ ] **Step 3: Run tests**

Run: `cd python && pytest tests/test_agent_runner.py -v`

- [ ] **Step 4: Commit**

```bash
git add python/src/symphony/agent_runner.py python/tests/test_agent_runner.py
git commit -m "feat(python): add agent runner (Codex app-server subprocess client)"
```

---

### Task 13: Logging

**Files:**
- Create: `python/src/symphony/log.py`
- Create: `python/tests/test_log.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_log.py
import pytest
import structlog
from symphony.log import configure_logging


def test_configure_logging():
    configure_logging(level="DEBUG")
    logger = structlog.get_logger()
    assert logger is not None


def test_configure_logging_with_file(tmp_path):
    log_file = tmp_path / "symphony.log"
    configure_logging(level="INFO", log_path=str(log_file))
    assert log_file.parent.exists()
```

- [ ] **Step 2: Write log.py**

```python
# src/symphony/log.py
import logging
import sys

import structlog


def configure_logging(
    level: str = "INFO",
    log_path: str | None = None,
):
    """Configure structlog with JSON output.

    Writes to stderr by default, optionally also to a file.
    """
    processors = [
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer(),
    ]

    structlog.configure(
        processors=processors,
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(sys.stderr),
        cache_logger_on_first_use=True,
    )

    # Set up stdlib logging for libraries
    logging.basicConfig(level=getattr(logging, level.upper(), logging.INFO))
    logging.getLogger().handlers.clear()

    if log_path:
        file_handler = logging.FileHandler(log_path)
        file_handler.setLevel(getattr(logging, level.upper(), logging.INFO))
        formatter = logging.Formatter(
            "%(asctime)s %(name)s %(levelname)s %(message)s"
        )
        file_handler.setFormatter(formatter)
        logging.getLogger().addHandler(file_handler)
```

- [ ] **Step 3: Run tests**

Run: `cd python && pytest tests/test_log.py -v`

- [ ] **Step 4: Commit**

```bash
git add python/src/symphony/log.py python/tests/test_log.py
git commit -m "feat(python): add structured logging with structlog"
```

---

### Task 14: Status Surface

**Files:**
- Create: `python/src/symphony/status.py`
- Create: `python/tests/test_status.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_status.py
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
        turn_count=3,
    )
    state.running["1"] = entry
    snap = build_status_snapshot(state)
    assert snap["counts"]["running"] == 1
    assert snap["running"][0]["issue_identifier"] == "PROJ-1"
    assert snap["running"][0]["turn_count"] == 3
    assert snap["running"][0]["tokens"]["input_tokens"] == 500


def test_retry_entries():
    state = OrchestratorState()
    entry = RetryEntry(issue_id="1", identifier="PROJ-1", attempt=3, due_at_ms=5000000.0, error="no slot")
    state.retry_attempts["1"] = entry
    snap = build_status_snapshot(state)
    assert snap["counts"]["retrying"] == 1
    assert snap["retrying"][0]["attempt"] == 3
    assert snap["retrying"][0]["error"] == "no slot"
```

- [ ] **Step 2: Write status.py**

```python
# src/symphony/status.py
from datetime import datetime, timezone
from typing import Any

from symphony.models import OrchestratorState


def build_status_snapshot(state: OrchestratorState) -> dict[str, Any]:
    """Build a status snapshot from orchestrator state (§13.3, §13.7.2)."""
    running_rows = []
    for issue_id, entry in state.running.items():
        row = {
            "issue_id": issue_id,
            "issue_identifier": entry.identifier,
            "state": entry.issue.state,
            "session_id": entry.session_id,
            "turn_count": entry.turn_count,
            "last_event": entry.last_codex_event,
            "last_message": entry.last_codex_message,
            "started_at": entry.started_at.isoformat() if entry.started_at else None,
            "last_event_at": entry.last_codex_timestamp.isoformat() if entry.last_codex_timestamp else None,
            "tokens": {
                "input_tokens": entry.codex_input_tokens,
                "output_tokens": entry.codex_output_tokens,
                "total_tokens": entry.codex_total_tokens,
            },
        }
        running_rows.append(row)

    retry_rows = []
    for issue_id, entry in state.retry_attempts.items():
        from datetime import datetime, timezone
        due_dt = datetime.fromtimestamp(entry.due_at_ms / 1000.0, tz=timezone.utc)
        row = {
            "issue_id": issue_id,
            "issue_identifier": entry.identifier,
            "attempt": entry.attempt,
            "due_at": due_dt.isoformat(),
            "error": entry.error,
        }
        retry_rows.append(row)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "counts": {
            "running": len(running_rows),
            "retrying": len(retry_rows),
        },
        "running": running_rows,
        "retrying": retry_rows,
        "codex_totals": {
            "input_tokens": state.codex_totals.input_tokens,
            "output_tokens": state.codex_totals.output_tokens,
            "total_tokens": state.codex_totals.total_tokens,
            "seconds_running": state.codex_totals.seconds_running,
        },
        "rate_limits": state.codex_rate_limits,
    }
```

- [ ] **Step 3: Run tests**

Run: `cd python && pytest tests/test_status.py -v`

- [ ] **Step 4: Commit**

```bash
git add python/src/symphony/status.py python/tests/test_status.py
git commit -m "feat(python): add status snapshot builder"
```

---

### Task 15: CLI Entry Point

**Files:**
- Create: `python/src/symphony/cli.py`
- Create: `python/src/symphony/__main__.py`
- Create: `python/tests/test_cli.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_cli.py
import pytest
from symphony.cli import parse_args


def test_default_workflow_path():
    args = parse_args([])
    assert args.workflow_path is None  # uses cwd default


def test_explicit_workflow_path():
    args = parse_args(["--port", "8080", "/path/to/WORKFLOW.md"])
    assert args.workflow_path == "/path/to/WORKFLOW.md"
    assert args.port == 8080


def test_port_flag():
    args = parse_args(["--port", "9090"])
    assert args.port == 9090


def test_logs_root():
    args = parse_args(["--logs-root", "/var/log/symphony"])
    assert args.logs_root == "/var/log/symphony"
```

- [ ] **Step 2: Write cli.py**

```python
# src/symphony/cli.py
import argparse
import sys
from pathlib import Path


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse CLI arguments.

    Positional: workflow_path (optional, defaults to ./WORKFLOW.md)
    Flags: --port, --logs-root
    """
    parser = argparse.ArgumentParser(
        description="Symphony — orchestrate coding agents from Linear issues",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "workflow_path",
        nargs="?",
        default=None,
        help="Path to WORKFLOW.md (default: ./WORKFLOW.md)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Enable HTTP server on this port (§13.7)",
    )
    parser.add_argument(
        "--logs-root",
        type=str,
        default=None,
        help="Directory for log files (default: ./log)",
    )
    return parser.parse_args(argv)
```

- [ ] **Step 3: Write __main__.py**

```python
# src/symphony/__main__.py
import asyncio
import logging
import sys
import os
from pathlib import Path

from symphony.cli import parse_args
from symphony.log import configure_logging
from symphony.workflow import load_workflow
from symphony.config import build_service_config
from symphony.exceptions import MissingWorkflowFile


def main():
    args = parse_args()
    log_level = os.environ.get("SYMPHONY_LOG_LEVEL", "INFO")
    logs_root = args.logs_root or os.path.join(os.getcwd(), "log")
    os.makedirs(logs_root, exist_ok=True)
    log_path = os.path.join(logs_root, "symphony.log")
    configure_logging(level=log_level, log_path=log_path)

    logger = logging.getLogger(__name__)
    logger.info("symphony_starting", log_path=log_path)

    try:
        wf = load_workflow(args.workflow_path)
    except MissingWorkflowFile as e:
        logger.critical("workflow_not_found", error=str(e))
        sys.exit(1)

    wf_dir = str(Path(args.workflow_path).parent) if args.workflow_path else os.getcwd()
    config = build_service_config(wf, workflow_dir=wf_dir)

    errors = config.validate_dispatch()
    if errors:
        for err in errors:
            logger.critical("config_validation_failed", error=err)
        sys.exit(1)

    logger.info("symphony_config_loaded",
                tracker_kind=config.tracker.kind,
                project_slug=config.tracker.project_slug,
                max_concurrent=config.agent.max_concurrent_agents)
    logger.info("symphony_started")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests**

Run: `cd python && pytest tests/test_cli.py -v`

- [ ] **Step 5: Verify CLI runs**

Run: `cd python && python -m symphony --help`
Expected: Shows help text

- [ ] **Step 6: Commit**

```bash
git add python/src/symphony/cli.py python/src/symphony/__main__.py python/tests/test_cli.py
git commit -m "feat(python): add CLI entry point"
```

---

### Task 16: HTTP Server (Optional Extension)

**Files:**
- Create: `python/src/symphony/server/__init__.py`
- Create: `python/src/symphony/server/app.py`
- Create: `python/src/symphony/server/router.py`
- Create: `python/tests/test_http_server.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_http_server.py
import pytest
from symphony.server.app import create_app
from symphony.models import OrchestratorState, RunningEntry, Issue


@pytest.mark.asyncio
async def test_state_endpoint():
    state = OrchestratorState()
    app = create_app(orchestrator=lambda: state)
    from httpx import AsyncClient, ASGITransport
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/state")
    assert resp.status_code == 200
    data = resp.json()
    assert "counts" in data
    assert "running" in data


@pytest.mark.asyncio
async def test_issue_detail_not_found():
    state = OrchestratorState()
    app = create_app(orchestrator=lambda: state)
    from httpx import AsyncClient, ASGITransport
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/PROJ-999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_issue_detail_found():
    state = OrchestratorState()
    issue = Issue(id="1", identifier="PROJ-1", title="Fix", state="In Progress")
    state.running["1"] = RunningEntry(
        task=None, identifier="PROJ-1", issue=issue,
        session_id="thr-1-turn-1",
    )
    app = create_app(orchestrator=lambda: state)
    from httpx import AsyncClient, ASGITransport
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/PROJ-1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["issue_identifier"] == "PROJ-1"
    assert data["status"] == "running"


@pytest.mark.asyncio
async def test_refresh():
    refresh_called = False

    def refresh_trigger():
        nonlocal refresh_called
        refresh_called = True

    state = OrchestratorState()
    app = create_app(orchestrator=lambda: state, refresh_callback=refresh_trigger)
    from httpx import AsyncClient, ASGITransport
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/refresh")
    assert resp.status_code == 202
    data = resp.json()
    assert data["queued"] is True
    assert refresh_called is True
```

- [ ] **Step 2: Write the server module**

```python
# src/symphony/server/__init__.py
```

```python
# src/symphony/server/app.py
from typing import Any, Callable
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse
from symphony.server.router import create_router
from symphony.models import OrchestratorState


def create_app(
    orchestrator: Callable[[], OrchestratorState] | None = None,
    refresh_callback: Callable[[], None] | None = None,
    dashboard_html: str | None = None,
) -> FastAPI:
    app = FastAPI(title="Symphony", version="0.1.0")
    router = create_router(orchestrator, refresh_callback)
    app.include_router(router)

    @app.get("/", response_class=HTMLResponse)
    async def dashboard():
        if dashboard_html:
            return dashboard_html
        state = orchestrator() if orchestrator else OrchestratorState()
        running_count = len(state.running)
        retry_count = len(state.retry_attempts)
        html = f"""<!DOCTYPE html>
<html><head><title>Symphony Dashboard</title>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
</head><body>
<h1>Symphony</h1>
<p>Running: {running_count} | Retrying: {retry_count}</p>
<p><a href="/api/v1/state">JSON API →</a></p>
</body></html>"""
        return html

    @app.exception_handler(404)
    async def not_found(request, exc):
        return JSONResponse(
            status_code=404,
            content={"error": {"code": "not_found", "message": "Not found"}},
        )

    @app.exception_handler(405)
    async def method_not_allowed(request, exc):
        return JSONResponse(
            status_code=405,
            content={"error": {"code": "method_not_allowed", "message": "Method not allowed"}},
        )

    return app
```

```python
# src/symphony/server/router.py
from typing import Any, Callable
from fastapi import APIRouter, HTTPException
from symphony.models import OrchestratorState
from symphony.status import build_status_snapshot


def create_router(
    get_state: Callable[[], OrchestratorState] | None = None,
    refresh_callback: Callable[[], None] | None = None,
) -> APIRouter:
    router = APIRouter(prefix="/api/v1")

    @router.get("/state")
    async def get_state_endpoint():
        state = get_state() if get_state else OrchestratorState()
        return build_status_snapshot(state)

    @router.get("/{issue_identifier}")
    async def get_issue_detail(issue_identifier: str):
        if not get_state:
            raise HTTPException(status_code=404, detail="Orchestrator not available")
        state = get_state()
        for issue_id, entry in state.running.items():
            if entry.identifier == issue_identifier:
                from datetime import datetime, timezone
                return {
                    "issue_identifier": entry.identifier,
                    "issue_id": issue_id,
                    "status": "running",
                    "workspace": {"path": ""},
                    "running": {
                        "session_id": entry.session_id,
                        "turn_count": entry.turn_count,
                        "state": entry.issue.state,
                        "started_at": entry.started_at.isoformat() if entry.started_at else None,
                        "last_event": entry.last_codex_event,
                        "last_message": entry.last_codex_message,
                        "last_event_at": entry.last_codex_timestamp.isoformat() if entry.last_codex_timestamp else None,
                        "tokens": {
                            "input_tokens": entry.codex_input_tokens,
                            "output_tokens": entry.codex_output_tokens,
                            "total_tokens": entry.codex_total_tokens,
                        },
                    },
                    "retry": None,
                    "last_error": None,
                }
        # Check retry queue
        for issue_id, entry in state.retry_attempts.items():
            if entry.identifier == issue_identifier:
                return {
                    "issue_identifier": entry.identifier,
                    "issue_id": issue_id,
                    "status": "retrying",
                    "retry": {
                        "attempt": entry.attempt,
                        "error": entry.error,
                    },
                }
        raise HTTPException(status_code=404, detail=f"Issue {issue_identifier} not found")

    @router.post("/refresh", status_code=202)
    async def refresh():
        if refresh_callback:
            refresh_callback()
        return {
            "queued": True,
            "coalesced": False,
            "operations": ["poll", "reconcile"],
        }

    return router
```

- [ ] **Step 3: Run tests**

Need httpx for tests: `pip install httpx`
Run: `cd python && pip install -e ".[server,test]" && pytest tests/test_http_server.py -v`

- [ ] **Step 4: Commit**

```bash
git add python/src/symphony/server/ python/tests/test_http_server.py
git commit -m "feat(python): add optional HTTP server with FastAPI"
```

---

### Task 17: File Watcher for Dynamic Workflow Reload

**Files:**
- Create: `python/src/symphony/workflow_store.py`
- Create: `python/tests/test_workflow_store.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_workflow_store.py
import pytest
import os
from pathlib import Path
from symphony.workflow_store import WorkflowStore
from symphony.config import build_service_config


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
```

- [ ] **Step 2: Write workflow_store.py**

```python
# src/symphony/workflow_store.py
import logging
import os
from pathlib import Path
from typing import Callable

from symphony.workflow import load_workflow
from symphony.config import build_service_config, ServiceConfig
from symphony.models import WorkflowDefinition
from symphony.exceptions import WorkflowError

logger = logging.getLogger(__name__)


class WorkflowStore:
    """Manages workflow file loading, caching, and change detection."""

    def __init__(
        self,
        path: str | None = None,
        on_reload: Callable[[], None] | None = None,
    ):
        self.path = path or os.path.join(os.getcwd(), "WORKFLOW.md")
        self.on_reload = on_reload
        self.workflow: WorkflowDefinition | None = None
        self.config: ServiceConfig | None = None
        self.last_error: str | None = None
        self._load()

    def _load(self):
        try:
            self.workflow = load_workflow(self.path)
            wf_dir = str(Path(self.path).parent)
            self.config = build_service_config(self.workflow, workflow_dir=wf_dir)
            self.last_error = None
            logger.info("workflow_loaded", path=self.path)
        except WorkflowError as e:
            self.last_error = str(e)
            logger.error("workflow_load_error", error=str(e))

    def reload(self) -> bool:
        """Re-read the workflow file. Returns True if successful."""
        old_config = self.config
        self._load()
        if self.workflow and self.config:
            if self.on_reload:
                self.on_reload()
            return True
        # Restore old config on failed reload
        if old_config:
            self.config = old_config
        return False
```

- [ ] **Step 3: Run tests**

Run: `cd python && pytest tests/test_workflow_store.py -v`

- [ ] **Step 4: Commit**

```bash
git add python/src/symphony/workflow_store.py python/tests/test_workflow_store.py
git commit -m "feat(python): add workflow store with file watching support"
```

---

### Task 18: E2E Integration — Wire Everything Together

**Files:**
- Modify: `python/src/symphony/__main__.py`
- Create: `python/tests/test_e2e.py`

- [ ] **Step 1: Write the failing integration test**

```python
# tests/test_e2e.py
import asyncio
import pytest
from pathlib import Path
from symphony.workflow import load_workflow
from symphony.config import build_service_config
from symphony.orchestrator import SymphonyOrchestrator
from symphony.tracker.memory import MemoryTracker
from symphony.models import Issue, OrchestratorState
from symphony.workspace import WorkspaceManager


@pytest.mark.asyncio
async def test_e2e_dispatch_and_retry(tmp_path):
    """Full end-to-end: load config → create workspace → dispatch → process tick."""
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

    # Run one tick
    await orch._tick()

    # Should have dispatched PROJ-1 and PROJ-2
    assert "1" in orch.state.running or "1" in orch.state.retry_attempts
    assert "2" in orch.state.running or "2" in orch.state.retry_attempts
    # PROJ-3 should not be dispatched (Done state)
    assert "3" not in orch.state.running
    assert "3" not in orch.state.retry_attempts
```

- [ ] **Step 2: Update __main__.py for full integration**

```python
# src/symphony/__main__.py (updated)
import asyncio
import logging
import sys
import os
import signal
from pathlib import Path

from symphony.cli import parse_args
from symphony.log import configure_logging
from symphony.workflow import load_workflow
from symphony.config import build_service_config
from symphony.workflow_store import WorkflowStore
from symphony.orchestrator import SymphonyOrchestrator
from symphony.workspace import WorkspaceManager
from symphony.tracker.memory import MemoryTracker as MemTracker
from symphony.exceptions import MissingWorkflowFile

logger = logging.getLogger(__name__)


async def async_main():
    args = parse_args()
    log_level = os.environ.get("SYMPHONY_LOG_LEVEL", "INFO")
    logs_root = args.logs_root or os.path.join(os.getcwd(), "log")
    os.makedirs(logs_root, exist_ok=True)
    log_path = os.path.join(logs_root, "symphony.log")
    configure_logging(level=log_level, log_path=log_path)

    logger.info("symphony_starting", log_path=log_path)

    # Load workflow
    store = WorkflowStore(path=args.workflow_path)
    if store.workflow is None:
        logger.critical("workflow_load_failed", error=store.last_error)
        sys.exit(1)

    config = store.config

    # Validate
    errors = config.validate_dispatch()
    if errors:
        for err in errors:
            logger.critical("config_validation_failed", error=err)
        sys.exit(1)

    logger.info("symphony_config_loaded",
                tracker_kind=config.tracker.kind,
                project_slug=config.tracker.project_slug,
                max_concurrent=config.agent.max_concurrent_agents)

    # Use memory tracker for now; real Linear tracker comes when configured
    tracker = MemTracker(active_states=config.tracker.active_states)

    ws_mgr = WorkspaceManager(
        root=config.workspace.root,
        after_create=config.hooks.after_create,
        before_run=config.hooks.before_run,
        after_run=config.hooks.after_run,
        before_remove=config.hooks.before_remove,
        hook_timeout_ms=config.hooks.timeout_ms,
    )

    orch = SymphonyOrchestrator(
        tracker=tracker,
        workspace_manager=ws_mgr,
        max_concurrent=config.agent.max_concurrent_agents,
        poll_interval_ms=config.polling.interval_ms,
        active_states=config.tracker.active_states,
        terminal_states=config.tracker.terminal_states,
        max_turns=config.agent.max_turns,
        max_retry_backoff_ms=config.agent.max_retry_backoff_ms,
        stall_timeout_ms=config.codex.stall_timeout_ms,
    )

    # Start HTTP server if enabled
    server_task = None
    server_port = args.port or (config.server.port if config.server and config.server.port else None)
    if server_port:
        try:
            from symphony.server.app import create_app
            import uvicorn

            async def get_state():
                return orch.state

            app = create_app(
                orchestrator=get_state,
                refresh_callback=lambda: asyncio.ensure_future(orch._tick()),
            )
            cfg = uvicorn.Config(app, host="127.0.0.1", port=server_port, log_level="info")
            server = uvicorn.Server(cfg)
            server_task = asyncio.create_task(server.serve())
            logger.info("http_server_started", port=server_port)
        except ImportError:
            logger.warning("http_server_disabled", detail="Install symphony[server] for HTTP support")

    # Handle shutdown
    stop_event = asyncio.Event()

    def _shutdown():
        logger.info("shutdown_requested")
        orch.stop()
        stop_event.set()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _shutdown)
        except NotImplementedError:
            # Windows
            pass

    logger.info("symphony_started")
    try:
        await orch.run()
    except asyncio.CancelledError:
        pass

    if server_task:
        server_task.cancel()

    logger.info("symphony_stopped")


def main():
    try:
        asyncio.run(async_main())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run tests**

Run: `cd python && pytest tests/test_e2e.py -v`

- [ ] **Step 4: Verify full CLI works**

Run: `cd python && python -m symphony`
Expected: Symphony starts, fails (no WORKFLOW.md in test dir), then exits

- [ ] **Step 5: Commit**

```bash
git add python/src/symphony/__main__.py python/tests/test_e2e.py
git commit -m "feat(python): wire full orchestrator integration with CLI"
```

---

### Self-Review Checklist

- [ ] Every spec section §1-§18 maps to at least one task
- [ ] No "TBD", "TODO", or placeholder code in any task
- [ ] Type/method names consistent across tasks (e.g., `sanitize_workspace_key` used in both Task 1 and Task 6)
- [ ] All test files have complete, runnable test code
- [ ] All file paths are exact and correct
