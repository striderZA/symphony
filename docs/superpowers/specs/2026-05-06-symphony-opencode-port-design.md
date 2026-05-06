# Symphony OpenCode Port Design

Port the Python Symphony implementation from Codex integration to OpenCode integration.
Based on `SPEC.md` (v1, language-agnostic). Rewrites in TypeScript with native OpenCode SDK.

## Architecture

- **Runtime:** Bun + TypeScript single-process event loop
- **Agent integration:** Central `opencode serve`, session-per-issue via `@opencode-ai/sdk` HTTP client
- **HTTP extension:** None — OpenCode's own API serves as the observability surface
- **Template engine:** Handlebars-compatible (`hono/template` or `liquidjs`) with strict variable checking
- **File watching:** Built-in `fs.watch` (no external dependency)
- **Tracker client:** `fetch`-based GraphQL client for Linear
- **OpenCode integration:** `@opencode-ai/sdk` HTTP client (no subprocess management)
- **Config validation:** Zod for typed config schemas
- **Logging:** pino with JSON output
- **Testing:** vitest

## Project Structure

```
symphony/                        # repo root
├── package.json
├── tsconfig.json
├── WORKFLOW.md
├── src/
│   ├── main.ts                  # CLI entry: start/connect to opencode serve, run loop
│   ├── workflow.ts              # WORKFLOW.md loader (YAML front matter + prompt body)
│   ├── config.ts                # Zod models: ServiceConfig, defaults, $VAR resolution
│   ├── models.ts                # Domain models: Issue, Workspace, OrchestratorState, etc.
│   ├── orchestrator.ts          # Single-authority state machine + poll loop + retry + reconciliation
│   ├── agent_runner.ts          # OpenCode SDK client wrapper (create session, send prompt, poll)
│   ├── workspace.ts             # Workspace lifecycle manager (create/reuse/remove)
│   ├── hooks.ts                 # Shell hook execution with timeout
│   ├── prompt_builder.ts        # Strict template rendering (handlebars/liquid)
│   ├── path_safety.ts           # Sanitize workspace keys + containment check
│   ├── tracker/
│   │   ├── base.ts              # Abstract TrackerAdapter interface
│   │   ├── linear.ts            # Linear GraphQL client (fetch-based)
│   │   └── memory.ts            # In-memory adapter for tests
│   ├── log.ts                   # pino-based structured logging
│   └── status.ts                # Runtime snapshot builder
├── tests/
│   ├── orchestrator.test.ts
│   ├── agent_runner.test.ts
│   ├── config.test.ts
│   ├── workflow.test.ts
│   ├── ...
└── .opencode/
    ├── package.json
    └── plugins/
        └── linear_graphql.ts    # Custom OpenCode plugin (replaces Codex client-side tool)
```

## OpenCode Integration

### Server Model

- Single `opencode serve` instance managed by Symphony or run externally
- If `server_start_command` is set, Symphony spawns it as a subprocess via `bash -lc <command>`, waits for the server to be healthy, then connects
- If `server_start_command` is null, Symphony assumes the server is already running at `server_url`
- Symphony connects via `@opencode-ai/sdk` HTTP client (`createOpencodeClient`)
- Config in WORKFLOW.md front matter:

```yaml
opencode:
  server_url: http://localhost:4096      # default
  server_start_command: null             # null = user-managed, or shell command like "opencode serve --port 4097"
  stall_timeout_ms: 300000               # no session events received = stalled, DELETE session + retry
  session_timeout_ms: 3600000            # max session wall-clock duration, DELETE session + fail on expiry
```

### Per-Issue Flow

1. Create session: `POST /session` with `{ title: "<identifier>: <title>" }`
2. Send prompt: `POST /session/:id/message` with rendered prompt as text part
3. Monitor: `GET /session/:id` or SSE event stream for completion/status
4. Cleanup: `DELETE /session/:id` on terminal state

### Agent Runner Rewrite

- Removes all subprocess management (no `asyncio.subprocess`, no stdin/stdout protocol)
- Removes Codex-specific threading/turn concepts
- `OpenCodeClient` interface abstracted for testing:

```typescript
interface OpenCodeClient {
  createSession(title: string): Promise<string>
  sendMessage(sessionId: string, prompt: string): Promise<void>
  getSessionStatus(sessionId: string): Promise<SessionStatus>
  deleteSession(sessionId: string): Promise<void>
}
```

### Config Changes (vs Python Codex config)

| Python `codex.*` field | OpenCode equivalent |
|---|---|
| `codex.command` | `opencode.server_start_command` |
| `codex.approval_policy` | Dropped (OpenCode manages via its own config) |
| `codex.thread_sandbox` | Dropped |
| `codex.turn_sandbox_policy` | Dropped |
| `codex.turn_timeout_ms` | `opencode.session_timeout_ms` |
| `codex.read_timeout_ms` | Dropped (SDK handles HTTP timeouts) |
| `codex.stall_timeout_ms` | Renamed to `opencode.stall_timeout_ms` |

### linear_graphql Plugin

- Implemented as OpenCode custom tool via `@opencode-ai/plugin`
- Registered in `.opencode/plugins/linear_graphql.ts`
- Tool reads the Linear API key from `LINEAR_API_KEY` environment variable (canonical env, same as what Symphony uses)
- Tool handles GraphQL operations using that key
- Same contract as SPEC §10.5 (one GraphQL operation per call, single operation validation, error handling)
- Auth source: env var rather than config file, since plugins load before Symphony parses WORKFLOW.md

## Orchestrator Changes

### Unchanged (from Python)

- Poll loop with configurable interval
- Candidate selection (state checks, blocker checks, priority sorting)
- Concurrency control (global + per-state)
- Retry/backoff with exponential delay
- Reconciliation (stall detection, terminal state cleanup)
- Workspace lifecycle (create/reuse, hooks, safety invariants)
- Prompt template rendering
- Status snapshot builder

### Changed

- Worker creation: calls `agentRunner.createSession()` instead of spawning subprocess
- Worker monitoring: polls `GET /session/:id` instead of reading stdout
- Token tracking: extracted from OpenCode message response instead of Codex events
- Session cleanup: `DELETE /session/:id` instead of killing subprocess
- No HTTP server module — all observability goes through OpenCode's built-in API (`GET /session`, `GET /session/status`, `GET /global/health`)
- `status.ts` still produces runtime snapshots but outputs them to structured logs rather than HTTP endpoints
- `LiveSession` model simplified: no `thread_id`/`turn_id`, no `session_id = <thread_id>-<turn_id>` composition, no `codex_app_server_pid`

### Retained Domain Logic

- `should_dispatch()` — candidate eligibility
- `dispatch_key()` — priority sorting
- `available_slots()` / `available_slots_for_state()` — concurrency
- `backoff_delay()` — exponential backoff
- `schedule_retry()` — retry queue management
- `reconcile_stalled_runs()` — stall detection
- `terminate_running_issue()` — cleanup
- `_startup_cleanup()` — terminal workspace cleanup

## Testing

- `OpenCodeClient` abstracted behind interface → mock/fake for unit tests
- Orchestrator tests use fake OpenCode client (no real HTTP calls)
- Linear tracker tests use fetch mocking
- E2E: optional integration test with real `opencode serve`
- vitest as test runner

## Modules Removed vs Python

Removed:
- `server/app.ts` and `server/router.ts` — no separate HTTP server
- `cli.py` — simplified to `main.ts` with minimal argument parsing
- All Codex-specific agent runner code

Rewritten:
- `agent_runner.ts` — uses `@opencode-ai/sdk` instead of asyncio subprocess
- `config.ts` — uses Zod instead of Pydantic
- `models.ts` — simplified session model

Added:
- `.opencode/plugins/linear_graphql.ts` — OpenCode plugin
