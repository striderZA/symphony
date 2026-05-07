# TypeScript Implementation Audit

Audit of `src/` against `SPEC.md` with reference to `elixir/` implementation.

## Status Summary

| Area | Status | Notes |
|------|--------|-------|
| Domain Models | ✅ Complete | `models.ts` covers all SPEC §4 entities |
| Workflow Loading | ✅ Complete | `workflow.ts` + `workflow_store.ts` file watch/reload |
| Config Building | ⚠️ Partial | Missing `codex` config, `server` config, schema validation |
| Config Validation | ⚠️ Partial | Basic checks only; no full SPEC §6 pipeline |
| Prompt Rendering | ✅ Complete | liquidjs with strict vars/filters |
| Workspace Management | ✅ Complete | Path safety, hooks, containment checks |
| Hook Execution | ✅ Complete | Shell hooks with timeout |
| Path Safety | ✅ Complete | sanitizeWorkspaceKey, checkContainment |
| Orchestrator Poll Loop | ⚠️ Partial | Missing: tracker state reconciliation (Part B), per-state concurrency fully |
| Dispatch Logic | ✅ Complete | shouldDispatch, availableSlots, priority sort |
| Retry/Backoff | ✅ Complete | Exponential backoff per SPEC §8.4 |
| Stall Detection | ✅ Complete | Per SPEC §8.5 Part A |
| Startup Cleanup | ✅ Complete | Per SPEC §8.6 |
| Logging | ⚠️ Partial | Missing structured context fields (`issue_id`, `session_id` on all log lines) |
| Status Snapshot | ✅ Complete | buildSnapshot/logSnapshot |
| Linear Tracker | ⚠️ Partial | Basic queries, missing pagination beyond first 50, no error categorization |
| Memory Tracker | ✅ Complete | For testing |
| Agent Runner | ❌ Different | Uses OpenCode HTTP API, not Codex app-server stdio protocol |
| Codex Protocol | ❌ Missing | No stdio JSON-RPC 2.0, no session lifecycle, no event streaming |
| Continuation Turns | ❌ Missing | Single run, no loop, no continuation guidance |
| Dynamic Tools | ❌ Missing | No `linear_graphql` tool |
| HTTP Dashboard | ❌ Missing | `src/server/` is empty |
| CLI | ❌ Missing | No `--port`, `--logs-root`, guardrails banner |
| SSH Worker Hosts | ❌ Missing | Not in SPEC but in Elixir ref |
| Tests | ⚠️ Partial | 54 tests across 16 files, decent coverage of individual units |

## Key Gaps vs Elixir Reference

### 1. Codex App-Server Protocol (SPEC §10)

This is the biggest gap. The TS impl uses OpenCode HTTP API (`opencode_client.ts`), while the Elixir ref implements the full Codex app-server stdio JSON-RPC 2.0 protocol (`codex/app_server.ex`, 1096 lines).

Missing:
- Stdio subprocess lifecycle (`codex.command`, `bash -lc`)
- JSON-RPC 2.0 transport (initialize → thread_start → turn_start → stream)
- Event streaming with token accounting
- Session ID extraction (`thread_id-turn_id`)
- Turn timeouts (`turn_timeout_ms`, `read_timeout_ms`)
- Dynamic tool registration/advertisement (`linear_graphql`)
- Event emission to orchestrator (session_started, turn_completed, etc.)

**The TS agent_runner.ts and opencode_client.ts need a full rewrite** to speak the Codex app-server protocol directly. The current OpenCode abstraction is a different architecture.

### 2. Continuation Turn Loop (SPEC §7.1, §10.2)

Elixir `agent_runner.ex` loops through multiple turns:
```elixir
do_run_codex_turns(session, workspace, issue, ..., 1, max_turns)
```

TS `agent_runner.ts` does one run → poll for completion → return.

Missing:
- After turn completion, re-check issue state
- If active, start next turn on same thread with continuation guidance (not full prompt)
- Cap at `agent.max_turns`
- Continuation vs first-turn prompt distinction

### 3. Config Schema & Codex Section (SPEC §5.3.6)

Elixir uses Ecto embedded schemas (`config/schema.ex`, 557 lines) with full validation, defaults, coercion.

TS does manual field extraction with basic defaults. Missing:
- `codex` config section (command, approval_policy, thread_sandbox, turn_sandbox_policy, timeouts)
- `server` config section (port, host)
- Typed schema validation
- Proper error types per SPEC §5.5

### 4. CLI (Elixir `cli.ex`)

Elixir ships as an escript (`bin/symphony`) with:
- `--i-understand-that-this-will-be-running-without-the-usual-guardrails` flag
- `--port` for HTTP dashboard
- `--logs-root` for log file directory
- Proper usage message and error handling

TS starts with `bun src/main.ts` directly.

### 5. HTTP Dashboard & JSON API (SPEC §13.7)

Elixir has a full Phoenix LiveView dashboard (`http_server.ex`, `symphony_elixir_web/`) serving:
- Human-readable dashboard at `/`
- JSON REST API at `/api/v1/state`
- Issue-specific endpoint `/api/v1/<issue_identifier>`
- Refresh endpoint `/api/v1/refresh`

TS has empty `src/server/` directory.

### 6. Tracker Reconciliation Part B (SPEC §8.5)

Elixir orchestrator reconciles running issue states from tracker every tick.

TS orchestrator (`orchestrator.ts`) only does stall detection (Part A). Missing:
- Fetch current states for running issue IDs
- Terminate workers for issues that moved to terminal/non-active states
- Update in-memory issue snapshots for active issues

### 7. Dynamic Tools (SPEC §10.5)

Elixir `codex/dynamic_tool.ex` (209 lines) implements the `linear_graphql` tool.
TS has nothing equivalent.

### 8. Structured Logging Context (SPEC §13.1)

TS logs don't consistently include `issue_id`, `issue_identifier`, `session_id` on issue-related log lines. Elixir consistently includes these.

### 9. Token Accounting (SPEC §13.5)

TS has basic counters but no:
- Delta tracking (last_reported vs cumulative)
- Rate-limit tracking
- Proper event-type-based token extraction

## What the TS Impl Does Well

- **Clean module boundaries** following SPEC §3.2 abstraction levels
- **Path safety** with sanitization and containment checks
- **Hook execution** with proper timeout
- **Workflow file watching** with change detection
- **liquidjs prompt rendering** with strict mode
- **Decent test scaffolding** (16 test files, modules testable in isolation)
- **Dispatch logic** (sorting, eligibility, concurrency slots)
- **Retry/backoff** matches SPEC formula

## Recommended Priority

1. **Rewire agent_runner to Codex app-server protocol** - biggest gap, replaces opencode_client
2. **Add continuation turn loop** in agent_runner
3. **Add tracker state reconciliation Part B** to orchestrator
4. **Add proper CLI** with flags and guardrails banner
5. **Add HTTP server** with dashboard and JSON API
6. **Complete config schema** with codex/server sections
7. **Add dynamic_tool** (linear_graphql)
8. **Improve logging context** and token accounting
9. **Flesh out tests** for new features
