# OpenCode Token Accounting

This document explains how OpenCode reports token usage through the SDK v2 protocol and how Symphony should account for it.

It is based on the current OpenCode SDK v2 source in `@opencode-ai/sdk/v2`, especially:

- `dist/gen/types.gen.d.ts` — message and part type definitions
- `dist/v2/client.d.ts` — v2 client entry point

## Short Version

- `AssistantMessage.tokens` is a final, per-message token breakdown — treat it as authoritative.
- `StepFinishPart.tokens` is a per-step snapshot — may be superseded by the final message token count.
- Tokens are keyed by `(sessionID, messageID)` — not by `thread_id`.
- There is no cumulative "thread total" concept in the SDK v2 protocol. Symphony must accumulate per-session totals itself.
- `cost` fields are dollar amounts and should be tracked separately from token counts.

## SDK v2 Token Sources

### `AssistantMessage.tokens`

Every completed assistant message carries a final token breakdown:

```typescript
tokens: {
  input: number
  output: number
  reasoning: number
  cache: {
    read: number
    write: number
  }
}
```

Meaning:

- `input`: prompt tokens consumed for this message.
- `output`: completion tokens generated.
- `reasoning`: tokens used for internal reasoning/chain-of-thought (included in `output`).
- `cache.read`: prompt cache hits.
- `cache.write`: prompt cache writes.

These arrive via `message.updated` SSE events. The message's `tokens` field updates as the message is produced and is final when the message completes (`finish` is set).

### `StepFinishPart.tokens`

Each finished step within a message also carries a token breakdown with the same shape:

```typescript
tokens: {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
}
```

Steps are intermediate; the message-level `tokens` field is the authoritative total for the whole message.

### `cost` fields

Both messages and steps include a `cost` field (a floating-point dollar amount). This is the model provider's computed cost, not a token count. Track cost separately from tokens.

## Event Flow

```
session.create()        → session_id
session.prompt()        → SSE stream of events
  message.updated       → AssistantMessage with tokens
    step-start          → step begins
    step-finish         → StepFinishPart with tokens + cost
    text                → text delta
    ...
  message.updated       → final message (finish set, tokens finalized)
```

## What The Fields Mean

### Per-message (authoritative)

- `AssistantMessage.tokens.input`: prompt tokens used for this message.
- `AssistantMessage.tokens.output`: completion tokens generated.
- `AssistantMessage.tokens.reasoning`: reasoning tokens (subset of output).
- `AssistantMessage.tokens.cache.read/write`: cache contributions.

Use these when you want:

- per-message accounting
- per-session accumulation

### Per-step (intermediate)

- `StepFinishPart.tokens`: snapshot of step-level token usage. May be superseded by message-level totals.

Use these only when:

- you need interim progress on a long-running message
- no final message-level tokens are available yet

### Cost

- `AssistantMessage.cost`: dollar cost of this message.
- `StepFinishPart.cost`: dollar cost of this step.

Track these separately from token counts.

## Recommended Accounting Strategy For Symphony

Track usage per OpenCode session.

For each session, keep:

- `accumulatedInput`: sum of `tokens.input` across all completed assistant messages in the session.
- `accumulatedOutput`: sum of `tokens.output` across all completed assistant messages.
- `accumulatedReasoning`: sum of `tokens.reasoning` across all completed assistant messages.
- `accumulatedCacheRead`: sum of `cache.read`.
- `accumulatedCacheWrite`: sum of `cache.write`.
- `accumulatedCost`: sum of `cost` across all completed assistant messages.
- `lastMessageId`: last processed message UUID (for dedup).

### Preferred source order

When a token-related event arrives, use this precedence:

1. `AssistantMessage.tokens` on `message.updated` (final)
2. `StepFinishPart.tokens` (interim, replaced by final message)

Ignore these for accounting:

- generic `params.usage` or `response.usage` — these are SDK transport metadata, not authoritative token reports.

### Algorithm

#### On `message.updated` with `AssistantMessage`

- If `.finish` is absent or the message is incomplete, skip (tokens may not be final).
- If `.finish` is set and `messageID` is already processed, skip (already counted).
- Otherwise:
  - Add `tokens.input` to `accumulatedInput`.
  - Add `tokens.output` to `accumulatedOutput`.
  - Add `tokens.reasoning` to `accumulatedReasoning`.
  - Add `tokens.cache.read` to `accumulatedCacheRead`.
  - Add `tokens.cache.write` to `accumulatedCacheWrite`.
  - Add `cost` to `accumulatedCost`.
  - Record `messageID` as processed.

#### On `step-finish`

- Optionally update interim display counters.
- Do not add step tokens to accumulated totals — the final message token count will supersede them.

### Why this matters

If you misclassify step-level tokens as final, or both step and message tokens, you will double-count and inflate the reported totals.

## What Symphony Should And Should Not Do

### Do

- Prefer `AssistantMessage.tokens` for all token reporting.
- Treat `tokens.input + tokens.output` as the authoritative token count for a message.
- Key accounting by `sessionID`, not issue ID (one session can cover multiple continuation turns for the same issue).
- Accumulate cost separately from tokens.

### Do not

- Do not treat every `tokens` payload as final — wait for `finish` on the message.
- Do not add step tokens on top of message tokens for the same message.
- Do not reset accounting when a new continuation turn starts on the same session.
- Do not mix `cost` into token counters.

## Current Implementation Status

Token tracking in the current Symphony TypeScript codebase:

- `LiveSession` and `RunningEntry` in `models.ts` track `codexInputTokens`, `codexOutputTokens`, `codexTotalTokens`.
- The `/api/v1/state` endpoint exposes `codex_totals` (`input_tokens`, `output_tokens`, `total_tokens`, `seconds_running`).
- The dashboard (HTML) displays aggregate token totals.
- Token fields currently default to `0` — the streaming event processing that updates them from SDK v2 events is not yet wired.

To wire accounting:

1. Attach an SSE event listener to `client.session.prompt()` that watches for `message.updated` events with completed `AssistantMessage` payloads.
2. On each completed message, extract `tokens` and `cost`, accumulate per `sessionID`.
3. Propagate accumulated totals to `RunningEntry.codexInputTokens` etc.
4. The existing `orchestrator.ts` finish/stop/terminate paths will then sum these into `codexTotals` and expose via the API/dashboard.

## Practical Interpretation For Logs

When reading raw SDK v2 events:

- `message.updated` with a completed `AssistantMessage.tokens` — authoritative per-message token count.
- `step-finish` — interim; useful for progress, not for final totals.
- `cost` — dollar amount; log separately from token counts.

## Implementation Checklist

- [ ] Wire SSE event listener to capture `message.updated` events.
- [ ] Filter for completed `AssistantMessage` (`.finish` is set).
- [ ] Extract `tokens.input`, `tokens.output`, `tokens.reasoning`, `tokens.cache.read`, `tokens.cache.write`.
- [ ] Deduplicate by `messageID`.
- [ ] Accumulate per `sessionID`.
- [ ] Propagate to `RunningEntry.codexInputTokens` etc. for dashboard/API display.
- [ ] Track `cost` separately from tokens.
- [ ] Log token updates at session end with full breakdown.
