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
    max_concurrent_agents_by_state: dict[str, int] = field(default_factory=dict)
    terminal_states: list[str] = field(default_factory=list)
