# Logging Best Practices

This guide defines logging conventions for Symphony so OpenCode agents and operators can diagnose failures quickly.

## Goals

- Make logs searchable by issue and session.
- Capture enough execution context to identify root cause without reruns.
- Keep message keys stable so dashboards/alerting are reliable.

## Required Context Fields

When logging issue-related work, include both identifiers:

- `issue_id`: Linear internal UUID (stable foreign key).
- `issue_identifier`: human ticket key (for example `MT-620`).

When logging OpenCode session lifecycle events, include:

- `session_id`: OpenCode session UUID.

## Message Design

- Use explicit `key=value` pairs in log message text for high-signal fields.
- Prefer deterministic message keys for recurring lifecycle events (use constants, not dynamic strings).
- Include the action outcome (`completed`, `failed`, `retrying`) and the reason/error when available.
- Avoid logging large payloads unless required for debugging.

## Scope Guidance

- `agent_runner.ts`: log session creation/completion/failure with issue context and `session_id`. Log each continuation turn attempt and its outcome.
- `orchestrator.ts`: log dispatch, retry, stall detection, terminal/non-active state transitions, and worker exits with issue context. Include `session_id` when the running entry has it.
- `workspace.ts`: log workspace create/remove lifecycle events with issue identifier.
- `status.ts`: log runtime snapshots at regular intervals with aggregate counters (no per-issue details in snapshot logs).

## Utility Functions

Use the helpers in `log.ts` to attach context:

```typescript
import { getLogger, withIssueContext, withSessionContext } from './log'

const log = withIssueContext(getLogger(), { issueId, issueIdentifier })
const log = withSessionContext(log, sessionId)
```

Both helpers return a child logger — the context fields are attached to every subsequent log call.

## Checklist For New Logs

- Is this event tied to a Linear issue? Include `issue_id` and `issue_identifier`.
- Is this event tied to an OpenCode session? Include `session_id`.
- Is the failure reason present and concise?
- Is the message key consistent with existing lifecycle logs in the same module?
