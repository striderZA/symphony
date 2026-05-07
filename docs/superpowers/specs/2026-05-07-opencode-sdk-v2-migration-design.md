# Migrate AgentRunner to @opencode-ai/sdk v2

**Date:** 2026-05-07
**Status:** Draft

## Goal

Replace the hand-rolled HTTP client in `opencode_client.ts` with the typed
`@opencode-ai/sdk` v2 client, and adapt `AgentRunner` to call it directly.

## Scope

| File | Action |
|------|--------|
| `src/opencode_client.ts` | **Delete** |
| `src/agent_runner.ts` | Rewrite — import SDK types, call SDK methods directly |
| `src/main.ts` | Add `createOpencodeClient()` call, pass to AgentRunner |
| All other files | No change |

## Design

### SDK client creation (main.ts)

```ts
import { createOpencodeClient } from '@opencode-ai/sdk/v2'

const opencodeClient = createOpencodeClient({
  baseUrl: config.opencode.serverUrl,
})
```

The client object carries the server URL internally.  No per-call URL
construction needed.

### AgentRunner

Constructor:

```ts
constructor(
  private client: OpencodeClient,
  private opts?: { directory?: string; workspace?: string }
)
```

`run()` flow:

1. **Create session** with inline permissions (no separate
   `autoAllowPermissions` call):
   ```ts
   const session = await this.client.session.create({
     title: `${issue.identifier}: ${issue.title}`,
     permission: [
       { permission: 'edit',              pattern: '*', action: 'allow' },
       { permission: 'bash',              pattern: '*', action: 'allow' },
       { permission: 'webfetch',          pattern: '*', action: 'allow' },
       { permission: 'doom_loop',         pattern: '*', action: 'allow' },
       { permission: 'external_directory', pattern: '*', action: 'allow' },
     ],
     ...this.opts,
   })
   ```

2. **Send prompt** async (fire-and-forget on the server side):
   ```ts
   await this.client.session.promptAsync({
     sessionID: session.id,
     parts: [{ type: 'text', text: prompt }],
     ...this.opts,
   })
   ```

3. **Hybrid idle detection** (`detectIdle`):
   - Subscribe to SSE events via `this.client.event.subscribe({ signal, ...this.opts })`
   - The SDK returns `{ stream: AsyncGenerator }` — iterate with `for await`
   - On each event:
     - Session idle/error → resolve immediately
     - Permission request → `this.client.permission.reply({ requestID, reply: 'always', ...this.opts })`
   - Safety poll timer (30 s): call `client.session.status()` to double-check
     idle/error.  Reset timer on each SSE event.
   - AbortSignal cancellation propagates through both SSE and status poll.

4. **Cleanup**:
   ```ts
   finally {
     abort.abort()
     await this.client.session.delete({ sessionID: session.id })
   }
   ```

### Event types

The SDK v2 SSE stream emits `EventSubscribeResponses` — a union of all event
shapes.  We filter for:

- Session status changes (idle / error) — check status object
- Permission requests — extract `requestID`, auto-reply with `'always'`

### Error handling

- `session.create()` throws on failure → caught by existing try/catch
- `promptAsync()` throws on failure → caught by existing try/catch
- SSE stream errors → safety poll detects session state independently
- `AbortError` from signal cancellation → expected, ignored
- Returns `AgentRunResult { success: false, error: message }` on any failure

### Compatibility

`AgentRunResult` interface is unchanged.  Orchestrator continues to call
`agentRunner.run(issue, prompt)` — no signature change needed.

The orchestrator's `cancel()` still works: `abort.abort()` on the shared
AbortController tears down the SSE stream and safety poll.

## Out of scope

- Changing the orchestrator's dispatch/reconciliation logic
- Changing the workspace/hooks pipeline
- Changing the dashboard/server
- Session reuse / multi-turn support (same as today)
