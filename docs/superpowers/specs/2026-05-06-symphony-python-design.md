# Symphony Python Implementation Design

Based on `SPEC.md` (v1, language-agnostic). Implements the Symphony orchestrator service in Python.

## Architecture

- **Runtime:** asyncio-native single-process event loop
- **HTTP extension:** FastAPI + uvicorn (optional, `--port` / `server.port`)
- **Template engine:** Jinja2 with `StrictUndefined`
- **File watching:** watchdog (cross-platform WORKFLOW.md reload)
- **Tracker client:** aiohttp for async GraphQL → Linear
- **Codex integration:** `asyncio.subprocess` with JSON line stdio protocol
- **Config validation:** Pydantic models
- **Logging:** structlog with JSON output
- **Testing:** pytest + pytest-asyncio

## Project Structure

```
python/
├── pyproject.toml
├── README.md
├── WORKFLOW.md
├── src/symphony/
│   ├── __init__.py
│   ├── __main__.py           # CLI: python -m symphony [path] [--port N] [--logs-root dir]
│   ├── cli.py                # argparse + startup orchestration
│   ├── workflow.py           # WORKFLOW.md loader (YAML front matter + prompt body)
│   ├── config.py             # Pydantic models: ServiceConfig, defaults, $VAR resolution
│   ├── models.py             # Dataclasses: Issue, Workspace, RunAttempt, LiveSession, etc.
│   ├── orchestrator.py       # Single-authority state machine + poll loop + retry + reconciliation
│   ├── workspace.py          # Workspace lifecycle manager (create/reuse/remove)
│   ├── agent_runner.py       # Codex app-server subprocess client
│   ├── prompt_builder.py     # Jinja2 strict template rendering
│   ├── path_safety.py        # Sanitize workspace keys + containment check
│   ├── tracker/
│   │   ├── __init__.py
│   │   ├── base.py           # Abstract TrackerAdapter
│   │   ├── linear.py         # Linear GraphQL client (candidates, state refresh, terminal fetch)
│   │   └── memory.py         # In-memory adapter for tests
│   ├── hooks.py              # Shell hook execution with timeout
│   ├── log.py                # structlog-based structured logging
│   ├── status.py             # Runtime snapshot builder
│   └── server/
│       ├── __init__.py
│       ├── app.py            # FastAPI app factory, dashboard HTML
│       └── router.py         # /api/v1/* endpoints
└── tests/
    ├── conftest.py
    ├── test_workflow.py      # §17.1: path, YAML, errors, defaults, $VAR, ~
    ├── test_config.py        # §17.1: typed access, validation, per-state concurrency
    ├── test_workspace.py     # §17.2: create/reuse, sanitization, containment, hooks lifecycle
    ├── test_prompt_builder.py # §17.1: render, strict fail, fallback
    ├── test_tracker_memory.py # §17.3: candidates, pagination, blockers, labels
    ├── test_orchestrator.py  # §17.4: dispatch sort, blocker gate, rec, retry backoff, stall
    ├── test_agent_runner.py  # §17.5: launch, timeouts, event extraction
    ├── test_cli.py           # §17.7: args, startup validation, exit codes
    ├── test_path_safety.py   # §9.5: sanitize + containment
    └── test_hooks.py         # §9.4: exec, timeout, failure semantics
```

## Key Design Decisions

### Config Resolution (§6.1)

1. Parse YAML front matter → raw dict
2. Apply built-in defaults for OPTIONAL fields
3. Resolve `$VAR` only for fields that explicitly contain `$VAR`
4. Coerce types, validate, return Pydantic `ServiceConfig`
5. No global env override (only explicit `$VAR` references)

### Async Concurrency Model

- Single `asyncio` event loop owned by the orchestrator
- Each agent run is an `asyncio.Task`
- `asyncio.Queue` channels agent events back to orchestrator
- Retry timers via `asyncio.create_task` with `asyncio.sleep`
- File watcher events fed via queue to avoid races
- All state mutations happen sequentially in the orchestrator task

### Codex App-Server Protocol (§10)

- Launch via `asyncio.create_subprocess_shell(f"bash -lc {cmd}", cwd=workspace_path)`
- JSON line protocol on `stdout`; `stderr` → separate diagnostic log
- Session startup: thread-create + turn-start with rendered prompt
- Continuation turns: same thread, continuation guidance (not full prompt)
- Extract `thread_id`, `turn_id` → `session_id = "{thread_id}-{turn_id}"`
- Forward all events to orchestrator with token counts

### State Machine (§7)

- `Unclaimed` → `Claimed` → `Running` or `RetryQueued` → `Released`
- Single `_tick()` coroutine runs: reconcile → validate → fetch → sort → dispatch → schedule
- All retry timers are cancellable asyncio tasks
- Reconciliation checks: stall timeout, tracker state (terminal/active/other)

### Safety Invariants (§9.5)

1. `cwd == workspace_path` before Codex launch
2. `workspace_path` must be under `workspace_root` (normalized comparison)
3. Workspace key: only `[A-Za-z0-9._-]`, others → `_`

### Dynamic Reload (§6.2)

- watchdog observer watches `WORKFLOW.md` parent dir
- On change: re-read, re-validate, re-apply effective config
- Invalid reload → keep last known good config, log error
- In-flight agent sessions NOT restarted

## Error Classes

- `MissingWorkflowFile`, `WorkflowParseError`, `WorkflowFrontMatterNotAMap`
- `TemplateParseError`, `TemplateRenderError`
- `UnsupportedTrackerKind`, `MissingTrackerApiKey`, `MissingTrackerProjectSlug`
- `LinearApiRequest`, `LinearApiStatus`, `LinearGraphQLErrors`, `LinearUnknownPayload`
- `CodexNotFound`, `InvalidWorkspaceCwd`, `ResponseTimeout`, `TurnTimeout`, `PortExit`, `ResponseError`, `TurnFailed`, `TurnCancelled`, `TurnInputRequired`
- `WorkspaceError`, `HookError`, `HookTimeout`

## Implementation Phases

1. **Core + Workflow/Config** — models.py, workflow.py, config.py, path_safety.py
2. **Workspace + Hooks** — workspace.py, hooks.py
3. **Tracker** — tracker/base.py, tracker/linear.py, tracker/memory.py
4. **Prompt Builder** — prompt_builder.py
5. **Orchestrator** — orchestrator.py
6. **Agent Runner** — agent_runner.py
7. **CLI + Logging** — cli.py, __main__.py, log.py
8. **HTTP Server** — server/app.py, server/router.py, status.py
9. **Tests** — all test files

## Conformance

Covering all sections marked `Core Conformance` in SPEC.md §17:
- §17.1 Workflow and Config Parsing
- §17.2 Workspace Manager and Safety
- §17.3 Issue Tracker Client
- §17.4 Orchestrator Dispatch, Reconciliation, and Retry
- §17.5 Coding-Agent App-Server Client (with documented high-trust policy)
- §17.6 Observability
- §17.7 CLI and Host Lifecycle

Extensions (when `server.*` config is present):
- §17.4 snapshot API tests
- §13.7 HTTP server with dashboard + JSON REST API
