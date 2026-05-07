# SDK v2 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hand-rolled HTTP client with `@opencode-ai/sdk` v2 in `AgentRunner`.

**Architecture:** Delete `opencode_client.ts`, rewrite `agent_runner.ts` to call SDK directly. Create the SDK client in `main.ts` and pass it to `AgentRunner`. Hybrid idle detection via SSE event stream + 30s safety poll.

**Tech Stack:** TypeScript, `@opencode-ai/sdk` v2 (v1.14.39), Bun runtime

---

### Task 1: Create SDK client in main.ts

**Files:**
- Modify: `typescript/src/main.ts`

- [ ] **Step 1: Import SDK and create client**

Replace the `HttpOpenCodeClient` import and instantiation with SDK client creation.

```ts
// Remove:
import { HttpOpenCodeClient } from './opencode_client'
const opencodeClient = new HttpOpenCodeClient(config.opencode.serverUrl)

// Add:
import { createOpencodeClient } from '@opencode-ai/sdk/v2'
const client = createOpencodeClient({ baseUrl: config.opencode.serverUrl })

// Change AgentRunner construction:
const agentRunner = new AgentRunner(client)
```

Full change in context (lines 6, 50, 68 of `main.ts`):

```diff
-import { HttpOpenCodeClient } from './opencode_client'
+import { createOpencodeClient } from '@opencode-ai/sdk/v2'
```

```diff
-  const opencodeClient = new HttpOpenCodeClient(config.opencode.serverUrl)
+  const client = createOpencodeClient({ baseUrl: config.opencode.serverUrl })
```

```diff
-  const agentRunner = new AgentRunner(opencodeClient)
+  const agentRunner = new AgentRunner(client)
```

- [ ] **Step 2: Run typecheck**

```bash
cd typescript && bun tsc --noEmit
```

Expected: FAILS — `agent_runner.ts` still imports `OpenCodeClient` from deleted file.

---

### Task 2: Rewrite agent_runner.ts

**Files:**
- Modify: `typescript/src/agent_runner.ts`

- [ ] **Step 1: Rewrite imports**

```ts
import type { Issue } from './models'
import { getLogger } from './log'
import type { OpencodeClient } from '@opencode-ai/sdk/v2'

/** Matches the SDK's PermissionRule — inlined to avoid subpath export issues */
type PermissionRule = { permission: string; pattern: string; action: 'allow' | 'deny' | 'ask' }
```

- [ ] **Step 2: Define permissions constant**

Add at module level (before the class):

```ts
const PERMISSIONS: PermissionRule[] = [
  { permission: 'edit',               pattern: '*', action: 'allow' },
  { permission: 'bash',               pattern: '*', action: 'allow' },
  { permission: 'webfetch',           pattern: '*', action: 'allow' },
  { permission: 'doom_loop',          pattern: '*', action: 'allow' },
  { permission: 'external_directory', pattern: '*', action: 'allow' },
]
```

- [ ] **Step 3: Rewrite class body**

Replace the entire class with:

```ts
export class AgentRunner {
  private onSessionCreated: ((sessionId: string) => void) | null = null

  constructor(private client: OpencodeClient) {}

  setSessionCreatedCallback(cb: (sessionId: string) => void): void {
    this.onSessionCreated = cb
  }

  async run(issue: Issue, prompt: string): Promise<AgentRunResult> {
    const log = getLogger()
    let sessionId: string | null = null
    try {
      const created = await this.client.session.create({
        title: `${issue.identifier}: ${issue.title}`,
        permission: PERMISSIONS,
      })
      sessionId = created.data!.id
      log.info({ issueId: issue.id, sessionId }, 'session_created')
      this.onSessionCreated?.(sessionId)

      await this.client.session.promptAsync({
        sessionID: sessionId,
        parts: [{ type: 'text', text: prompt }],
      })
      log.info({ issueId: issue.id, sessionId }, 'prompt_sent')

      const result = await detectSessionResult(this.client, sessionId, issue.id, log)

      if (result.error) {
        log.warn({ issueId: issue.id, sessionId, error: result.error }, 'session_error')
        return { sessionId, success: false, error: result.error }
      }

      log.info({ issueId: issue.id, sessionId }, 'session_idle')
      return { sessionId, success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error({ issueId: issue.id, error: message }, 'agent_run_failed')
      return { sessionId: null, success: false, error: message }
    }
  }
}
```

**Note on `created.data!`:** The SDK v2 returns `RequestResult` with `data` and `error` fields when `throwOnError` is false (default). `session.create()` with invalid params returns an error in `data.error`. We use the `!` assertion since we trust our params. If the create fails, the `catch` block handles it (a throw, not error in data).

- [ ] **Step 4: Add `detectSessionResult` helper function**

Add after the class, at module level:

```ts
async function detectSessionResult(
  client: OpencodeClient,
  sessionID: string,
  issueID: string,
  log: ReturnType<typeof getLogger>,
): Promise<{ error?: string }> {
  const abort = new AbortController()

  try {
    const sse = await client.event.subscribe({
      signal: abort.signal,
    })

    const safetyTimer = setInterval(async () => {
      try {
        const statuses = await client.session.status()
        const s = statuses.data?.[sessionID]
        if (s?.type === 'idle' || s?.type === 'retry') {
          abort.abort()
        }
      } catch { /* safety poll failure is non-fatal */ }
    }, 30_000)

    try {
      for await (const event of sse.stream) {
        if (event.type === 'session.idle') {
          const props = (event as any).properties
          if (props?.sessionID === sessionID) {
            abort.abort()
            log.info({ issueID, sessionID }, 'session_idle_event')
            return {}
          }
        }
        if (event.type === 'session.error') {
          const props = (event as any).properties
          if (props?.sessionID === sessionID) {
            abort.abort()
            const errMsg = props?.error?.message ?? 'session_error'
            log.warn({ issueID, sessionID, error: errMsg }, 'session_error_event')
            return { error: errMsg }
          }
        }
        if (event.type === 'permission.asked') {
          const props = (event as any).properties
          if (props?.sessionID === sessionID && props?.id) {
            // Fire-and-forget — don't block the event loop
            client.permission.reply({
              requestID: props.id,
              reply: 'always',
            }).catch(() => {})
            log.info({ issueID, sessionID, permId: props.id }, 'permission_auto_approved')
          }
        }
      }
    } finally {
      clearInterval(safetyTimer)
    }

    // SSE stream ended — fall back to explicit status check
    const statuses = await client.session.status()
    const s = statuses.data?.[sessionID]
    if (s?.type === 'idle') return {}
    if (s?.type === 'retry') return { error: s.message || 'session_retry' }
    return { error: 'stream_ended' }
  } catch (err: unknown) {
    if ((err as any)?.name === 'AbortError') {
      // Abort triggered by idle/error event or safety poll — check status
      try {
        const statuses = await client.session.status()
        const s = statuses.data?.[sessionID]
        if (s?.type === 'idle') return {}
        if (s?.type === 'retry') return { error: s.message || 'session_retry' }
      } catch { /* status check failed after abort — assume clean exit */ }
      return {}
    }
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 5: Run typecheck**

```bash
cd typescript && bun tsc --noEmit
```

Expected: FAILS — `agent_runner.test.ts` imports `OpenCodeClient` from deleted file.

---

### Task 3: Delete opencode_client.ts

**Files:**
- Delete: `typescript/src/opencode_client.ts`

- [ ] **Step 1: Delete the file**

```bash
Remove-Item -LiteralPath "typescript/src/opencode_client.ts"
```

- [ ] **Step 2: Run typecheck**

```bash
cd typescript && bun tsc --noEmit
```

Expected: FAILS — `agent_runner.test.ts` still references `OpenCodeClient`.

---

### Task 4: Rewrite agent_runner tests

**Files:**
- Modify: `typescript/tests/agent_runner.test.ts`

- [ ] **Step 1: Rewrite the entire test file**

The existing tests reference `OpenCodeClient` (deleted) with methods `sendMessage`, `getSessionStatus`, `startTurn` that don't exist in the new code. Replace with tests that mock the v2 SDK client.

```ts
import { describe, it, expect, vi } from 'vitest'
import { AgentRunner } from '../src/agent_runner'
import type { Issue } from '../src/models'

function makeIssue(overrides?: Partial<Issue>): Issue {
  return {
    id: 'issue-1', identifier: 'TICKET-1', title: 'Test', state: 'In Progress',
    description: null, priority: null, branchName: null, url: null,
    labels: [], blockedBy: [], createdAt: null, updatedAt: null,
    ...overrides,
  } as Issue
}

/**
 * Create a mock OpencodeClient.
 *
 * By default the SSE stream yields a `session.idle` event immediately,
 * causing detectSessionResult to resolve without waiting for the 30s
 * safety poll timer.
 */
function mockClient(opts?: {
  createFail?: boolean
  promptFail?: boolean
  streamItems?: Array<{ type: string; properties: Record<string, unknown> }>
}) {
  const stream = (async function* () {
    const items = opts?.streamItems ?? [
      { type: 'session.idle', properties: { sessionID: 'session-1' } },
    ]
    for (const item of items) {
      yield item as any
    }
    // Keep stream alive (resolves immediately after yielding all items)
    await new Promise(() => {})
  })()

  return {
    session: {
      create: opts?.createFail
        ? vi.fn().mockRejectedValue(new Error('create failed'))
        : vi.fn().mockResolvedValue({ data: { id: 'session-1' } }),
      promptAsync: opts?.promptFail
        ? vi.fn().mockRejectedValue(new Error('prompt failed'))
        : vi.fn().mockResolvedValue({ data: {} }),
      status: vi.fn().mockResolvedValue({
        data: { 'session-1': { type: 'idle' as const } },
      }),
      delete: vi.fn().mockResolvedValue({ data: {} }),
    },
    event: {
      subscribe: vi.fn().mockResolvedValue({ stream }),
    },
    permission: {
      reply: vi.fn().mockResolvedValue({ data: {} }),
    },
  } as any
}

describe('AgentRunner (SDK v2)', () => {
  it('creates session and sends prompt, detects idle from SSE', async () => {
    const client = mockClient()
    const runner = new AgentRunner(client)
    const issue = makeIssue({ id: 'abc', identifier: 'MT-1', title: 'Test', state: 'Todo' })
    const result = await runner.run(issue, 'Work on this')
    expect(result.success).toBe(true)
    expect(result.sessionId).toBe('session-1')
    expect(client.session.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'MT-1: Test',
    }))
    expect(client.session.promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sessionID: 'session-1' })
    )
  })

  it('handles createSession failure', async () => {
    const client = mockClient({ createFail: true })
    const runner = new AgentRunner(client)
    const result = await runner.run(makeIssue(), 'Work')
    expect(result.success).toBe(false)
    expect(result.error).toContain('create failed')
  })

  it('handles promptAsync failure', async () => {
    const client = mockClient({ promptFail: true })
    const runner = new AgentRunner(client)
    const result = await runner.run(makeIssue(), 'Work')
    expect(result.success).toBe(false)
    expect(result.error).toContain('prompt failed')
  })

  it('handles session error event from SSE', async () => {
    const client = mockClient({
      streamItems: [
        { type: 'session.error', properties: { sessionID: 'session-1', error: { message: 'model error' } } },
      ],
    })
    const runner = new AgentRunner(client)
    const result = await runner.run(makeIssue(), 'Work')
    expect(result.success).toBe(false)
    expect(result.error).toContain('model error')
  })

  it('auto-approves permission.asked events', async () => {
    const client = mockClient({
      streamItems: [
        { type: 'permission.asked', properties: { sessionID: 'session-1', id: 'perm-1' } },
        { type: 'session.idle', properties: { sessionID: 'session-1' } },
      ],
    })
    const runner = new AgentRunner(client)
    await runner.run(makeIssue(), 'Work')
    expect(client.permission.reply).toHaveBeenCalledWith(
      expect.objectContaining({ requestID: 'perm-1', reply: 'always' })
    )
  })

  it('includes permissions in session create', async () => {
    const client = mockClient()
    const runner = new AgentRunner(client)
    await runner.run(makeIssue(), 'do work')
    expect(client.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: expect.arrayContaining([
          expect.objectContaining({ permission: 'edit', pattern: '*', action: 'allow' }),
          expect.objectContaining({ permission: 'bash', pattern: '*', action: 'allow' }),
          expect.objectContaining({ permission: 'doom_loop', pattern: '*', action: 'allow' }),
          expect.objectContaining({ permission: 'external_directory', pattern: '*', action: 'allow' }),
        ]),
      })
    )
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd typescript && bun vitest run
```

Expected: ALL tests PASS.

- [ ] **Step 3: Run typecheck**

```bash
cd typescript && bun tsc --noEmit
```

Expected: PASS (no errors).

---

### Task 5: Final validation

- [ ] **Step 1: Run full test suite**

```bash
cd typescript && bun vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Commit**

```bash
git add typescript/src/main.ts typescript/src/agent_runner.ts typescript/tests/agent_runner.test.ts
git rm typescript/src/opencode_client.ts
git commit -m "refactor: migrate agent runner to @opencode-ai/sdk v2"
```
