---
name: debug
description:
  Investigate stuck runs and execution failures by tracing Symphony and Codex
  logs with issue/session identifiers; use when runs stall, retry repeatedly, or
  fail unexpectedly.
---

# Debug

## Goals

- Find why a run is stuck, retrying, or failing.
- Correlate Linear issue identity to a Codex session quickly.
- Read the right logs in the right order to isolate root cause.

## Log Sources

- Primary runtime log: `python/log/symphony.log`
  - Includes orchestrator, agent runner, and Codex app-server lifecycle logs
    via structlog.
- Rotated runtime logs: `python/log/symphony.log*`
  - Check these when the relevant run is older.

## Correlation Keys

- `issue_identifier`: human ticket key (example: `MT-625`)
- `issue_id`: Linear UUID (stable internal ID)
- `session_id`: Codex thread-turn pair (`<thread_id>-<turn_id>`)

## Quick Triage (Stuck Run)

1. Confirm scheduler/worker symptoms for the ticket.
2. Find recent lines for the ticket (`issue_identifier` first).
3. Extract `session_id` from matching lines.
4. Trace that `session_id` across start, stream, completion/failure, and stall
   handling logs.
5. Decide class of failure: timeout/stall, app-server startup failure, turn
   failure, or orchestrator retry loop.

## Commands

```bash
# 1) Narrow by ticket key (fastest entry point)
rg -n "issue_identifier=MT-625" python/log/symphony.log*

# 2) If needed, narrow by Linear UUID
rg -n "issue_id=<linear-uuid>" python/log/symphony.log*

# 3) Pull session IDs seen for that ticket
rg -o "session_id=[^ ;]+" python/log/symphony.log* | sort -u

# 4) Trace one session end-to-end
rg -n "session_id=<thread>-<turn>" python/log/symphony.log*

# 5) Focus on stuck/retry signals
rg -n "stall|retry|turn_timeout|turn_failed|worker_failed" python/log/symphony.log*
```

## Investigation Flow

1. Locate the ticket slice:
    - Search by `issue_identifier=<KEY>`.
    - If noise is high, add `issue_id=<UUID>`.
2. Establish timeline:
    - Identify first session start.
    - Follow with session completed, ended with error, or worker exit lines.
3. Classify the problem:
    - Stall loop: `stall_detected`.
    - App-server startup: `worker_failed`.
    - Turn execution failure: `turn_failed`, `turn_cancelled`, `turn_timeout`.
    - Worker crash: `worker_failed`, `worker_unexpected_error`.
4. Validate scope:
    - Check whether failures are isolated to one issue/session or repeating
      across multiple tickets.
5. Capture evidence:
    - Save key log lines with timestamps and identifiers.
    - Record probable root cause and the exact failing stage.

## Notes

- Prefer `rg` over `grep` for speed on large logs.
- Check rotated logs (`python/log/symphony.log*`) before concluding data is
  missing.
