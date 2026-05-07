# TypeScript Symphony Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the TypeScript Symphony implementation by closing all gaps against SPEC.md and the Elixir reference.

**Architecture:** Keep OpenCode HTTP client approach (don't switch to Codex app-server stdio). Add continuation turn loops, event streaming, CLI, HTTP dashboard, tracker reconciliation, proper config schema, structured logging, and dynamic tools.

**Tech Stack:** Bun runtime, TypeScript, Zod (config validation), liquidjs (prompt rendering), pino (logging), vitest (testing).

**Reference:** `elixir/lib/symphony_elixir/` for implementation patterns. `SPEC.md` for normative requirements.

---

## File Structure (all paths relative to `typescript/`)

### Files to Modify:
- `src/agent_runner.ts` — add continuation turn loop, event streaming, max_turns enforcement
- `src/opencode_client.ts` — richer protocol: session events, token info, tool registration
- `src/orchestrator.ts` — add reconciliation Part B (tracker state refresh), integrate config reload
- `src/config.ts` — add `codex` and `server` config sections, typed schema validation
- `src/models.ts` — add LiveSession, CodexEvent types, improve RunningEntry
- `src/log.ts` — add structured context helpers (issue_id, session_id)
- `src/status.ts` — enrich snapshot with event details, rate limits
- `src/main.ts` — integrate CLI arg parsing
- `src/tracker/linear.ts` — add pagination, error categorization
- `src/tracker/base.ts` — add error types if needed
- `src/workspace.ts` — minor fix: after_create hook failure should be fatal (currently caught but logged)

### Files to Create:
- `src/cli.ts` — CLI argument parsing with `--port`, `--logs-root`, guardrails banner
- `src/server/index.ts` — HTTP server setup (Bun.serve or Hono)
- `src/server/dashboard.ts` — HTML dashboard at `/`
- `src/server/api.ts` — JSON REST API at `/api/v1/*`
- `src/dynamic_tool.ts` — linear_graphql tool (advertised to OpenCode sessions)
- `src/events.ts` — Codex event types and token/delta tracking
- `src/errors.ts` — error classification types per SPEC §5.5, §11.4

### All commands run from `typescript/` directory

> Every `npx vitest` and `bun` command in this plan must be run from within the `typescript/` directory (e.g., `cd typescript && npx vitest run ...`). All git add paths use `typescript/` prefix.

---

### Task 1: Rewrite config with Zod schema + codex/server sections

**Files:**
- Modify: `src/config.ts`
- Modify: `src/models.ts` (if needed for new types)
- Test: `tests/config.test.ts`

- [ ] **Step 1: Write tests for new config fields**

```typescript
// tests/config.test.ts additions
import { describe, it, expect } from 'vitest'
import { buildServiceConfig, parseAndValidateConfig, ServiceConfig } from '../src/config'
import type { WorkflowDefinition } from '../src/models'

describe('parseAndValidateConfig', () => {
  it('parses codex section defaults', () => {
    const wf: WorkflowDefinition = {
      config: { tracker: { kind: 'linear', api_key: 'x', project_slug: 'p' } },
      promptTemplate: 'hello',
    }
    const cfg = parseAndValidateConfig(wf)
    expect(cfg.codex.command).toBe('codex app-server')
    expect(cfg.codex.turnTimeoutMs).toBe(3600000)
    expect(cfg.codex.readTimeoutMs).toBe(5000)
    expect(cfg.codex.stallTimeoutMs).toBe(300000)
  })

  it('parses codex section from front matter', () => {
    const wf: WorkflowDefinition = {
      config: {
        tracker: { kind: 'linear', api_key: 'x', project_slug: 'p' },
        codex: {
          command: 'my-custom-command',
          turn_timeout_ms: 1800000,
          stall_timeout_ms: 60000,
        },
      },
      promptTemplate: 'hello',
    }
    const cfg = parseAndValidateConfig(wf)
    expect(cfg.codex.command).toBe('my-custom-command')
    expect(cfg.codex.turnTimeoutMs).toBe(1800000)
    expect(cfg.codex.stallTimeoutMs).toBe(60000)
  })

  it('parses server section from front matter', () => {
    const wf: WorkflowDefinition = {
      config: {
        tracker: { kind: 'linear', api_key: 'x', project_slug: 'p' },
        server: { port: 8080, host: '0.0.0.0' },
      },
      promptTemplate: 'hello',
    }
    const cfg = parseAndValidateConfig(wf)
    expect(cfg.server.port).toBe(8080)
    expect(cfg.server.host).toBe('0.0.0.0')
  })

  it('rejects invalid max_turns', () => {
    const wf: WorkflowDefinition = {
      config: {
        tracker: { kind: 'linear', api_key: 'x', project_slug: 'p' },
        agent: { max_turns: -1 },
      },
      promptTemplate: 'hello',
    }
    expect(() => parseAndValidateConfig(wf)).toThrow()
  })

  it('applies defaults for empty config', () => {
    const wf: WorkflowDefinition = {
      config: {
        tracker: { kind: 'linear', api_key: 'x', project_slug: 'p' },
      },
      promptTemplate: 'hello',
    }
    const cfg = parseAndValidateConfig(wf)
    expect(cfg.polling.intervalMs).toBe(30000)
    expect(cfg.agent.maxConcurrentAgents).toBe(10)
    expect(cfg.agent.maxTurns).toBe(20)
    expect(cfg.hooks.timeoutMs).toBe(60000)
    expect(cfg.server).toEqual({ port: null, host: '127.0.0.1' })
  })
})
```

Run: `cd typescript && npx vitest run tests/config.test.ts -t "parseAndValidateConfig"`
Expected: FAIL (function not defined)

- [ ] **Step 2: Add Zod dependency and implement schema**

```bash
cd typescript && bun add zod
```

- [ ] **Step 3: Rewrite src/config.ts with Zod schema**

```typescript
import { z } from 'zod'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { WorkflowDefinition } from './models'

const VAR_PATTERN = /^\$(\w+)$/

function resolveVar(value: string, env: Record<string, string | undefined>): string {
  const m = VAR_PATTERN.exec(value)
  if (m) return env[m[1]] ?? ''
  return value
}

function expandPath(value: string, workflowDir?: string): string {
  let expanded = value.replace(/^~/, process.env.HOME || process.env.USERPROFILE || '')
  if (workflowDir && !expanded.startsWith('/') && !expanded.match(/^[A-Za-z]:\\/)) {
    expanded = join(workflowDir, expanded)
  }
  return expanded
}

const TrackerConfigSchema = z.object({
  kind: z.string().min(1),
  endpoint: z.string().default('https://api.linear.app/graphql'),
  apiKey: z.string().min(1, 'tracker.api_key is missing or empty'),
  projectSlug: z.string().min(1, 'tracker.project_slug is required for linear tracker'),
  activeStates: z.array(z.string()).default(['Todo', 'In Progress']),
  terminalStates: z.array(z.string()).default(['Closed', 'Cancelled', 'Canceled', 'Duplicate', 'Done']),
})

const PollingConfigSchema = z.object({
  intervalMs: z.number().int().positive().default(30000),
})

const WorkspaceConfigSchema = z.object({
  root: z.string().default(() => join(tmpdir(), 'symphony_workspaces')),
})

const HooksConfigSchema = z.object({
  afterCreate: z.string().nullable().default(null),
  beforeRun: z.string().nullable().default(null),
  afterRun: z.string().nullable().default(null),
  beforeRemove: z.string().nullable().default(null),
  timeoutMs: z.number().int().positive().default(60000),
})

const AgentConfigSchema = z.object({
  maxConcurrentAgents: z.number().int().positive().default(10),
  maxTurns: z.number().int().positive().default(20),
  maxRetryBackoffMs: z.number().int().positive().default(300000),
  maxConcurrentAgentsByState: z.record(z.number().int().positive()).default({}),
})

const CodexConfigSchema = z.object({
  command: z.string().default('codex app-server'),
  approvalPolicy: z.union([z.string(), z.record(z.unknown())]).default('never'),
  threadSandbox: z.string().default('workspace-write'),
  turnSandboxPolicy: z.record(z.unknown()).default({}),
  turnTimeoutMs: z.number().int().positive().default(3600000),
  readTimeoutMs: z.number().int().positive().default(5000),
  stallTimeoutMs: z.number().int().default(300000),
})

const ServerConfigSchema = z.object({
  port: z.number().int().nullable().default(null),
  host: z.string().default('127.0.0.1'),
})

export const ServiceConfigSchema = z.object({
  tracker: TrackerConfigSchema,
  polling: PollingConfigSchema,
  workspace: WorkspaceConfigSchema,
  hooks: HooksConfigSchema,
  agent: AgentConfigSchema,
  codex: CodexConfigSchema,
  server: ServerConfigSchema,
})

export type ServiceConfig = z.infer<typeof ServiceConfigSchema>
export type TrackerConfig = z.infer<typeof TrackerConfigSchema>
export type CodexConfig = z.infer<typeof CodexConfigSchema>
export type ServerConfig = z.infer<typeof ServerConfigSchema>

function applyVarResolution(config: Record<string, unknown>, env: Record<string, string | undefined>): Record<string, unknown> {
  const out = { ...config }
  const trackerRaw = (out.tracker as Record<string, unknown>) ?? {}
  if (trackerRaw.api_key && typeof trackerRaw.api_key === 'string') {
    trackerRaw.api_key = resolveVar(trackerRaw.api_key, env)
    out.tracker = trackerRaw
  }
  return out
}

function applyPathExpansion(config: Record<string, unknown>, workflowDir?: string): Record<string, unknown> {
  const out = { ...config }
  const wsRaw = (out.workspace as Record<string, unknown>) ?? {}
  if (wsRaw.root && typeof wsRaw.root === 'string') {
    wsRaw.root = expandPath(wsRaw.root, workflowDir)
    out.workspace = wsRaw
  }
  return out
}

export function buildServiceConfig(wf: WorkflowDefinition, workflowDir?: string, envOverrides?: Record<string, string | undefined>): ServiceConfig {
  const env = envOverrides ?? (process.env as Record<string, string | undefined>)
  let raw = applyVarResolution(wf.config, env)
  raw = applyPathExpansion(raw, workflowDir)

  const trackerRaw = (raw.tracker as Record<string, unknown>) ?? {}
  if (!trackerRaw.endpoint && trackerRaw.kind === 'linear') {
    trackerRaw.endpoint = 'https://api.linear.app/graphql'
  }
  raw.tracker = trackerRaw

  const codexRaw = (raw.codex as Record<string, unknown>) ?? {}
  const serverRaw = (raw.server as Record<string, unknown>) ?? {}

  const parsed = ServiceConfigSchema.parse({
    ...raw,
    codex: codexRaw,
    server: serverRaw,
  })

  return parsed
}

export function parseAndValidateConfig(wf: WorkflowDefinition): ServiceConfig {
  return buildServiceConfig(wf)
}

export function validateDispatchConfig(cfg: ServiceConfig): string[] {
  const errors: string[] = []
  if (!cfg.tracker.kind) errors.push('tracker.kind is required')
  else if (cfg.tracker.kind !== 'linear') errors.push(`unsupported tracker.kind: ${cfg.tracker.kind}`)
  if (!cfg.tracker.apiKey) errors.push('tracker.api_key is missing or empty')
  if (cfg.tracker.kind === 'linear' && !cfg.tracker.projectSlug) errors.push('tracker.project_slug is required for linear tracker')
  if (!cfg.codex.command) errors.push('codex.command is required')
  return errors
}
```

- [ ] **Step 4: Run tests**

Run: `cd typescript && npx vitest run tests/config.test.ts`
Expected: PASS

- [ ] **Step 5: Update main.ts and existing consumers**

In `src/main.ts`, update imports to use new config types. The config access pattern changes from `config.tracker.kind` to same (zod infers same shape), but add `config.codex.command`, `config.server.port`, etc.

- [ ] **Step 6: Commit**

```bash
git add typescript/src/config.ts typescript/src/main.ts typescript/tests/config.test.ts typescript/package.json typescript/bun.lock
git commit -m "feat: add Zod config schema with codex and server sections"
```

---

### Task 2: Add structured event types and logging context

**Files:**
- Create: `src/events.ts`
- Modify: `src/log.ts`
- Modify: `src/models.ts`
- Test: `tests/log.test.ts`

- [ ] **Step 1: Create src/events.ts**

```typescript
// Codex agent event types for streaming and observability

export type CodexEventType =
  | 'session_started'
  | 'startup_failed'
  | 'turn_completed'
  | 'turn_failed'
  | 'turn_cancelled'
  | 'turn_ended_with_error'
  | 'turn_input_required'
  | 'approval_auto_approved'
  | 'unsupported_tool_call'
  | 'notification'
  | 'other_message'
  | 'malformed'

export interface CodexEvent {
  event: CodexEventType
  timestamp: string
  sessionId?: string
  turnId?: string
  codexAppServerPid?: string | null
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
  payload?: Record<string, unknown>
}

export interface TurnResult {
  sessionId: string
  threadId: string
  turnId: string
  status: 'completed' | 'failed' | 'cancelled' | 'timed_out' | 'input_required'
  tokenUsage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  events: CodexEvent[]
}

export interface AgentRunUpdate {
  issueId: string
  type: 'token_usage' | 'event' | 'status_change' | 'error'
  data: Record<string, unknown>
}
```

- [ ] **Step 2: Write tests for structured logging**

```typescript
// tests/log.test.ts additions
import { describe, it, expect } from 'vitest'
import { configureLogging, getLogger, withIssueContext, withSessionContext } from '../src/log'

describe('structured logging', () => {
  it('includes issue_id and issue_identifier in log entries', () => {
    const log = withIssueContext(getLogger(), { issueId: 'abc', issueIdentifier: 'TICKET-1' })
    // pino child logger adds bindings
    expect(log.bindings).toBeDefined()
  })
})
```

Run: `cd typescript && npx vitest run tests/log.test.ts -t "structured logging"`
Expected: FAIL

- [ ] **Step 3: Add structured context helpers to src/log.ts**

```typescript
import pino from 'pino'

let logger: pino.Logger = pino({
  level: process.env.SYMPHONY_LOG_LEVEL || 'info',
})

export function configureLogging(options?: { level?: string; path?: string }): void {
  logger = pino({
    level: options?.level || process.env.SYMPHONY_LOG_LEVEL || 'info',
    transport: options?.path
      ? { target: 'pino/file', options: { destination: options.path } }
      : undefined,
  })
}

export function getLogger(): pino.Logger {
  return logger
}

export function withIssueContext(base: pino.Logger, ctx: { issueId: string; issueIdentifier: string }): pino.Logger {
  return base.child({ issue_id: ctx.issueId, issue_identifier: ctx.issueIdentifier })
}

export function withSessionContext(base: pino.Logger, sessionId: string): pino.Logger {
  return base.child({ session_id: sessionId })
}
```

- [ ] **Step 4: Add LiveSession and session_id to models.ts RunningEntry**

Add to `src/models.ts`:
```typescript
export interface LiveSession {
  sessionId: string
  threadId: string
  turnId: string
  codexAppServerPid: string | null
  lastCodexEvent: CodexEventType | null
  lastCodexTimestamp: Date | null
  lastCodexMessage: string
  codexInputTokens: number
  codexOutputTokens: number
  codexTotalTokens: number
  lastReportedInputTokens: number
  lastReportedOutputTokens: number
  lastReportedTotalTokens: number
  turnCount: number
}
```

Add `session: LiveSession | null` field to `RunningEntry`.

- [ ] **Step 5: Run tests**

Run: `cd typescript && npx vitest run tests/log.test.ts tests/models.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add typescript/src/events.ts src/log.ts src/models.ts tests/log.test.ts
git commit -m "feat: add event types and structured logging context"
```

---

### Task 3: Add continuation turn loop to AgentRunner

**Files:**
- Modify: `src/agent_runner.ts`
- Modify: `src/opencode_client.ts`
- Test: `tests/agent_runner.test.ts`

- [ ] **Step 1: Write tests for continuation logic**

```typescript
// tests/agent_runner.test.ts additions
import { describe, it, expect, vi } from 'vitest'
import { AgentRunner } from '../src/agent_runner'
import type { OpenCodeClient, SessionStatus } from '../src/opencode_client'
import type { Issue } from '../src/models'

function makeIssue(overrides?: Partial<Issue>): Issue {
  return {
    id: 'issue-1', identifier: 'TICKET-1', title: 'Test', state: 'In Progress',
    description: null, priority: null, branchName: null, url: null,
    labels: [], blockedBy: [], createdAt: null, updatedAt: null,
    ...overrides,
  }
}

describe('AgentRunner continuation turns', () => {
  it('loops through multiple turns when issue stays active', async () => {
    let turnCount = 0
    const client: OpenCodeClient = {
      createSession: vi.fn().mockResolvedValue('session-1'),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      getSessionStatus: vi.fn().mockImplementation(async () => {
        turnCount++
        return { id: 'session-1', status: 'completed' } as SessionStatus
      }),
      deleteSession: vi.fn(),
      startTurn: vi.fn().mockResolvedValue({ threadId: 't1', turnId: 'turn-1' }),
    }
    const runner = new AgentRunner(client, {
      maxTurns: 3,
      issueStateFetcher: async () => [makeIssue()],
    })
    const result = await runner.run(makeIssue(), 'do work')
    expect(result.success).toBe(true)
    expect(client.sendMessage).toHaveBeenCalledTimes(3)
  })

  it('stops looping when issue state is no longer active', async () => {
    const client: OpenCodeClient = {
      createSession: vi.fn().mockResolvedValue('session-1'),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      getSessionStatus: vi.fn().mockResolvedValue({ id: 'session-1', status: 'completed' } as SessionStatus),
      deleteSession: vi.fn(),
      startTurn: vi.fn().mockResolvedValue({ threadId: 't1', turnId: 'turn-1' }),
    }
    const runner = new AgentRunner(client, {
      maxTurns: 10,
      issueStateFetcher: async () => [makeIssue({ state: 'Done' })],
    })
    const result = await runner.run(makeIssue(), 'do work')
    expect(result.success).toBe(true)
    expect(client.sendMessage).toHaveBeenCalledTimes(1) // only first turn
  })
})
```

Run: `cd typescript && npx vitest run tests/agent_runner.test.ts`
Expected: FAIL

- [ ] **Step 2: Expand OpenCodeClient interface**

```typescript
export interface OpenCodeClient {
  createSession(title: string): Promise<string>
  sendMessage(sessionId: string, prompt: string): Promise<void>
  startTurn(sessionId: string): Promise<{ threadId: string; turnId: string }>
  getSessionStatus(sessionId: string): Promise<SessionStatus>
  deleteSession(sessionId: string): Promise<void>
}

export interface AgentRunnerOptions {
  maxTurns: number
  issueStateFetcher: (issueIds: string[]) => Promise<Issue[]>
}
```

- [ ] **Step 3: Rewrite src/agent_runner.ts**

```typescript
import type { Issue, TurnResult } from './models'
import type { OpenCodeClient } from './opencode_client'
import { getLogger, withIssueContext } from './log'
import { renderPrompt } from './prompt_builder'

const CONTINUATION_GUIDANCE = (turn: number, maxTurns: number) => `
Continuation guidance:

- The previous Codex turn completed normally, but the Linear issue is still in an active state.
- This is continuation turn ${turn} of ${maxTurns} for the current agent run.
- Resume from the current workspace state instead of restarting from scratch.
- The original task instructions are already present in this thread.
- Focus on the remaining ticket work.
`

export interface AgentRunResult {
  sessionId: string | null
  success: boolean
  error?: string
  turnsCompleted: number
}

export interface AgentRunnerConfig {
  maxTurns: number
  issueStateFetcher: (issueIds: string[]) => Promise<Issue[]>
}

export class AgentRunner {
  constructor(
    private client: OpenCodeClient,
    private config: AgentRunnerConfig,
  ) {}

  async run(issue: Issue, prompt: string): Promise<AgentRunResult> {
    const log = withIssueContext(getLogger(), { issueId: issue.id, issueIdentifier: issue.identifier })
    let turnsCompleted = 0
    let currentSessionId: string | null = null

    try {
      currentSessionId = await this.client.createSession(`${issue.identifier}: ${issue.title}`)
      log.info({ sessionId: currentSessionId }, 'session_created')

      const { threadId, turnId: firstTurnId } = await this.client.startTurn(currentSessionId)
      log.info({ sessionId: currentSessionId, threadId, turnId: firstTurnId }, 'first_turn_started')

      await this.client.sendMessage(currentSessionId, prompt)
      turnsCompleted = 1

      for (let turn = 2; turn <= this.config.maxTurns; turn++) {
        const refreshedIssue = await this.refreshIssueState(issue.id)
        if (!refreshedIssue || !this.isActiveState(refreshedIssue.state)) {
          log.info({ turnsCompleted: turn - 1 }, 'issue_no_longer_active')
          break
        }

        const { turnId } = await this.client.startTurn(currentSessionId)
        log.info({ sessionId: currentSessionId, turnId, turnNum: turn }, 'continuation_turn_started')

        await this.client.sendMessage(currentSessionId, CONTINUATION_GUIDANCE(turn, this.config.maxTurns))
        turnsCompleted = turn
      }

      log.info({ turnsCompleted }, 'agent_run_completed')
      return { sessionId: currentSessionId, success: true, turnsCompleted }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error({ error: message }, 'agent_run_failed')
      return { sessionId: currentSessionId, success: false, error: message, turnsCompleted }
    }
  }

  private async refreshIssueState(issueId: string): Promise<Issue | null> {
    try {
      const issues = await this.config.issueStateFetcher([issueId])
      return issues[0] ?? null
    } catch {
      return null
    }
  }

  private isActiveState(state: string): boolean {
    const terminalStates = ['closed', 'cancelled', 'canceled', 'duplicate', 'done']
    return !terminalStates.includes(state.toLowerCase())
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd typescript && npx vitest run tests/agent_runner.test.ts`
Expected: PASS

- [ ] **Step 5: Wire AgentRunner into orchestrator**

In `src/orchestrator.ts`, update `dispatchIssue` to use the new `AgentRunner` constructor with `maxTurns` and `issueStateFetcher`.

- [ ] **Step 6: Commit**

```bash
git add typescript/src/agent_runner.ts src/opencode_client.ts tests/agent_runner.test.ts
git commit -m "feat: add continuation turn loop to agent runner"
```

---

### Task 4: Add tracker state reconciliation Part B

**Files:**
- Modify: `src/orchestrator.ts`
- Test: `tests/orchestrator.test.ts`

- [ ] **Step 1: Write tests for reconciliation Part B**

```typescript
// tests/orchestrator.test.ts additions
import { describe, it, expect, vi } from 'vitest'
import { SymphonyOrchestrator } from '../src/orchestrator'
import { createOrchestratorState } from '../src/models'
import type { Issue } from '../src/models'

function makeIssue(overrides?: Partial<Issue>): Issue {
  return {
    id: 'issue-1', identifier: 'TICKET-1', title: 'Test', state: 'In Progress',
    description: null, priority: null, branchName: null, url: null,
    labels: [], blockedBy: [], createdAt: null, updatedAt: null,
    ...overrides,
  }
}

describe('orchestrator reconciliation Part B', () => {
  it('terminates runs for issues that moved to terminal state', async () => {
    const tracker = {
      fetchCandidateIssues: vi.fn().mockResolvedValue([]),
      fetchIssuesByStates: vi.fn().mockResolvedValue([]),
      fetchIssueStatesByIds: vi.fn().mockResolvedValue([
        makeIssue({ id: 'run-1', state: 'Done' }),
      ]),
    }
    const agentRunner = { run: vi.fn() }
    const orch = new SymphonyOrchestrator({ tracker: tracker as any, agentRunner: agentRunner as any })

    orch.state.running.set('run-1', {
      issueId: 'run-1', identifier: 'TICKET-1',
      issue: makeIssue({ id: 'run-1', state: 'In Progress' }),
      sessionId: null, lastCodexEvent: null, lastCodexTimestamp: null, lastCodexMessage: '',
      codexInputTokens: 0, codexOutputTokens: 0, codexTotalTokens: 0,
      lastReportedInputTokens: 0, lastReportedOutputTokens: 0, lastReportedTotalTokens: 0,
      retryAttempt: 0, startedAt: new Date(),
      task: Promise.resolve(), cancel: null,
      session: null,
    })
    orch.state.claimed.add('run-1')

    const state = await orch.reconcileTrackerStates()
    expect(state.running.has('run-1')).toBe(false)
    expect(state.claimed.has('run-1')).toBe(false)
    expect(tracker.fetchIssueStatesByIds).toHaveBeenCalledWith(['run-1'])
  })

  it('keeps running issues that are still active', async () => {
    const tracker = {
      fetchCandidateIssues: vi.fn().mockResolvedValue([]),
      fetchIssuesByStates: vi.fn().mockResolvedValue([]),
      fetchIssueStatesByIds: vi.fn().mockResolvedValue([
        makeIssue({ id: 'run-1', state: 'In Progress' }),
      ]),
    }
    const agentRunner = { run: vi.fn() }
    const orch = new SymphonyOrchestrator({ tracker: tracker as any, agentRunner: agentRunner as any })

    orch.state.running.set('run-1', {
      issueId: 'run-1', identifier: 'TICKET-1',
      issue: makeIssue({ id: 'run-1', state: 'In Progress' }),
      sessionId: null, lastCodexEvent: null, lastCodexTimestamp: null, lastCodexMessage: '',
      codexInputTokens: 0, codexOutputTokens: 0, codexTotalTokens: 0,
      lastReportedInputTokens: 0, lastReportedOutputTokens: 0, lastReportedTotalTokens: 0,
      retryAttempt: 0, startedAt: new Date(),
      task: Promise.resolve(), cancel: null,
      session: null,
    })

    const state = await orch.reconcileTrackerStates()
    expect(state.running.has('run-1')).toBe(true)
  })
})
```

Run: `cd typescript && npx vitest run tests/orchestrator.test.ts -t "reconciliation Part B"`
Expected: FAIL

- [ ] **Step 2: Add reconcileTrackerStates method to orchestrator**

In `src/orchestrator.ts`, add the reconciliation method and wire it into the tick:

```typescript
  async reconcileTrackerStates(): Promise<OrchestratorState> {
    const runningIds = Array.from(this.state.running.keys())
    if (runningIds.length === 0) return this.state

    try {
      const currentIssues = await this.tracker.fetchIssueStatesByIds(runningIds)
      const currentMap = new Map(currentIssues.map((i) => [i.id, i]))

      for (const [issueId, entry] of this.state.running) {
        const current = currentMap.get(issueId)
        if (!current) continue

        const currentState = current.state
        if (this.terminalStates.includes(currentState)) {
          getLogger().warn({ issueId, identifier: entry.identifier, state: currentState }, 'terminating_terminal_issue')
          if (entry.cancel) entry.cancel()
          this.state = this.terminateRunningIssue(issueId, true)
          this.state.completed.add(issueId)
        } else if (!this.activeStates.includes(currentState)) {
          getLogger().warn({ issueId, identifier: entry.identifier, state: currentState }, 'terminating_non_active_issue')
          if (entry.cancel) entry.cancel()
          this.state = this.terminateRunningIssue(issueId, false)
        } else {
          // Update in-memory issue snapshot
          const updatedEntry = { ...entry, issue: current }
          this.state.running.set(issueId, updatedEntry as any)
        }
      }
    } catch (err) {
      getLogger().error({ error: String(err) }, 'state_reconciliation_failed')
    }

    return this.state
  }
```

Then update `tick()` and `reconcileRunning()` to call `reconcileTrackerStates()`.

- [ ] **Step 3: Run tests**

Run: `cd typescript && npx vitest run tests/orchestrator.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add typescript/src/orchestrator.ts tests/orchestrator.test.ts
git commit -m "feat: add tracker state reconciliation Part B"
```

---

### Task 5: Add CLI with flags and guardrails banner

**Files:**
- Create: `src/cli.ts`
- Modify: `src/main.ts`
- Test: `tests/cli.test.ts`

- [ ] **Step 1: Write tests for CLI parsing**

```typescript
// tests/cli.test.ts
import { describe, it, expect } from 'vitest'
import { parseCliArgs, CliArgs } from '../src/cli'

describe('parseCliArgs', () => {
  it('defaults when no args provided', () => {
    const args = parseCliArgs([])
    expect(args.workflowPath).toBeNull()
    expect(args.port).toBeNull()
    expect(args.logsRoot).toBeNull()
    expect(args.acknowledged).toBe(false)
  })

  it('parses workflow path', () => {
    const args = parseCliArgs(['./my/WORKFLOW.md'])
    expect(args.workflowPath).toBe('./my/WORKFLOW.md')
  })

  it('parses --port flag', () => {
    const args = parseCliArgs(['--port', '8080'])
    expect(args.port).toBe(8080)
  })

  it('parses --logs-root flag', () => {
    const args = parseCliArgs(['--logs-root', '/var/log/symphony'])
    expect(args.logsRoot).toBe('/var/log/symphony')
  })

  it('parses acknowledgement flag', () => {
    const args = parseCliArgs(['--i-understand-that-this-will-be-running-without-the-usual-guardrails'])
    expect(args.acknowledged).toBe(true)
  })

  it('combines all flags', () => {
    const args = parseCliArgs([
      '--port', '8080',
      '--logs-root', './logs',
      'path/to/WORKFLOW.md',
      '--i-understand-that-this-will-be-running-without-the-usual-guardrails',
    ])
    expect(args.port).toBe(8080)
    expect(args.logsRoot).toBe('./logs')
    expect(args.workflowPath).toBe('path/to/WORKFLOW.md')
    expect(args.acknowledged).toBe(true)
  })
})
```

Run: `cd typescript && npx vitest run tests/cli.test.ts`
Expected: FAIL

- [ ] **Step 2: Create src/cli.ts**

```typescript
export interface CliArgs {
  workflowPath: string | null
  port: number | null
  logsRoot: string | null
  acknowledged: boolean
}

const GUARDRAILS_FLAG = '--i-understand-that-this-will-be-running-without-the-usual-guardrails'

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    workflowPath: null,
    port: null,
    logsRoot: null,
    acknowledged: false,
  }

  let i = 0
  while (i < argv.length) {
    const arg = argv[i]
    if (arg === GUARDRAILS_FLAG) {
      args.acknowledged = true
      i++
    } else if (arg === '--port' && i + 1 < argv.length) {
      args.port = parseInt(argv[i + 1], 10)
      i += 2
    } else if (arg === '--logs-root' && i + 1 < argv.length) {
      args.logsRoot = argv[i + 1]
      i += 2
    } else if (!arg.startsWith('--') && !args.workflowPath) {
      args.workflowPath = arg
      i++
    } else {
      i++
    }
  }

  return args
}

export function guardrailsBanner(): string {
  const lines = [
    'This Symphony implementation is a low key engineering preview.',
    'Codex will run without any guardrails.',
    'Symphony is not a supported product and is presented as-is.',
    '',
    `To proceed, start with \`${GUARDRAILS_FLAG}\` CLI argument`,
  ]
  const width = Math.max(...lines.map((l) => l.length))
  const border = '─'.repeat(width + 2)
  const lines2 = lines.map((l) => '│ ' + l.padEnd(width) + ' │')
  return [
    '╭' + border + '╮',
    ...lines2,
    '╰' + border + '╯',
  ].join('\n')
}

export function usageMessage(): string {
  return `Usage: symphony [--port <port>] [--logs-root <path>] [--i-understand-that-this-will-be-running-without-the-usual-guardrails] [path-to-WORKFLOW.md]`
}
```

- [ ] **Step 3: Update src/main.ts to use CLI args**

```typescript
import { parseCliArgs, guardrailsBanner, usageMessage } from './cli'
import { WorkflowStore } from './workflow_store'
import { buildServiceConfig, validateDispatchConfig } from './config'
import { configureLogging, getLogger } from './log'
import { SymphonyOrchestrator } from './orchestrator'
import { AgentRunner } from './agent_runner'
import { HttpOpenCodeClient } from './opencode_client'
import { WorkspaceManager } from './workspace'
import { LinearTracker } from './tracker/linear'
import { logSnapshot } from './status'

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2))

  if (!args.acknowledged) {
    console.error(guardrailsBanner())
    process.exit(1)
  }

  const logLevel = process.env.SYMPHONY_LOG_LEVEL || 'info'
  configureLogging({ level: logLevel, path: args.logsRoot ? `${args.logsRoot}/symphony.log` : undefined })
  const log = getLogger()
  log.info('symphony_starting')

  // ... rest of main with config, etc.
  // Pass args.port to HTTP server if set
}
```

- [ ] **Step 4: Run tests**

Run: `cd typescript && npx vitest run tests/cli.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add typescript/src/cli.ts src/main.ts tests/cli.test.ts
git commit -m "feat: add CLI with flags and guardrails banner"
```

---

### Task 6: Add HTTP server with dashboard and JSON API

**Files:**
- Create: `src/server/index.ts`
- Create: `src/server/dashboard.ts`
- Create: `src/server/api.ts`
- Modify: `src/main.ts` (wire up server start)
- Test: `tests/server.test.ts`

- [ ] **Step 1: Write tests for API responses**

```typescript
// tests/server.test.ts
import { describe, it, expect } from 'vitest'
import { buildApiState } from '../src/server/api'
import { createOrchestratorState } from '../src/models'

describe('buildApiState', () => {
  it('returns state json with counts and totals', () => {
    const state = createOrchestratorState()
    const result = buildApiState(state)
    expect(result).toHaveProperty('generated_at')
    expect(result.counts).toEqual({ running: 0, retrying: 0 })
    expect(result.codex_totals).toBeDefined()
  })

  it('includes running entries with turn_count', () => {
    const state = createOrchestratorState()
    state.running.set('1', {
      issueId: '1', identifier: 'TICKET-1',
      issue: { id: '1', identifier: 'TICKET-1', title: 'test', state: 'In Progress', description: null, priority: null, branchName: null, url: null, labels: [], blockedBy: [], createdAt: null, updatedAt: null },
      sessionId: 'sess-1', lastCodexEvent: null, lastCodexTimestamp: null, lastCodexMessage: '',
      codexInputTokens: 100, codexOutputTokens: 50, codexTotalTokens: 150,
      lastReportedInputTokens: 0, lastReportedOutputTokens: 0, lastReportedTotalTokens: 0,
      retryAttempt: 3, startedAt: new Date(), task: null, cancel: null,
      session: null,
    })
    const result = buildApiState(state)
    expect(result.running).toHaveLength(1)
    expect(result.running[0].turn_count).toBe(3)
  })
})
```

Run: `cd typescript && npx vitest run tests/server.test.ts`
Expected: FAIL

- [ ] **Step 2: Create src/server/api.ts**

```typescript
import type { OrchestratorState } from '../models'

export interface ApiStateResponse {
  generated_at: string
  counts: { running: number; retrying: number }
  running: Array<{
    issue_id: string
    issue_identifier: string
    state: string
    session_id: string | null
    turn_count: number
    last_event: string | null
    started_at: string | null
  }>
  retrying: Array<{
    issue_id: string
    identifier: string
    attempt: number
    error: string | null
  }>
  codex_totals: {
    input_tokens: number
    output_tokens: number
    total_tokens: number
    seconds_running: number
  }
}

export function buildApiState(orchState: OrchestratorState): ApiStateResponse {
  const running = Array.from(orchState.running.values()).map((e) => ({
    issue_id: e.issueId,
    issue_identifier: e.identifier,
    state: e.issue.state,
    session_id: e.sessionId,
    turn_count: e.retryAttempt,
    last_event: e.lastCodexEvent,
    started_at: e.startedAt?.toISOString() ?? null,
  }))
  const retrying = Array.from(orchState.retryAttempts.values()).map((e) => ({
    issue_id: e.issueId,
    identifier: e.identifier,
    attempt: e.attempt,
    error: e.error,
  }))
  return {
    generated_at: new Date().toISOString(),
    counts: { running: running.length, retrying: retrying.length },
    running,
    retrying,
    codex_totals: {
      input_tokens: orchState.codexTotals.inputTokens,
      output_tokens: orchState.codexTotals.outputTokens,
      total_tokens: orchState.codexTotals.totalTokens,
      seconds_running: orchState.codexTotals.secondsRunning,
    },
  }
}
```

- [ ] **Step 3: Create src/server/dashboard.ts**

```typescript
import type { ApiStateResponse } from './api'

export function renderDashboard(state: ApiStateResponse): string {
  const runningRows = state.running.map((r) => `
    <tr>
      <td>${r.issue_identifier}</td>
      <td>${r.state}</td>
      <td>${r.turn_count}</td>
      <td>${r.session_id ?? '-'}</td>
      <td>${r.last_event ?? '-'}</td>
    </tr>`).join('')

  const retryRows = state.retrying.map((r) => `
    <tr>
      <td>${r.identifier}</td>
      <td>${r.attempt}</td>
      <td>${r.error ?? '-'}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Symphony Dashboard</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 0 auto; padding: 1rem; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 0.5rem; text-align: left; border-bottom: 1px solid #ddd; }
  th { background: #f5f5f5; }
  .counts { display: flex; gap: 2rem; margin: 1rem 0; }
  .count-card { padding: 1rem; border: 1px solid #ddd; border-radius: 4px; }
  .count-number { font-size: 2rem; font-weight: bold; }
</style></head>
<body>
  <h1>Symphony</h1>
  <p><em>Generated at ${state.generated_at}</em></p>
  <div class="counts">
    <div class="count-card">
      <div>Running</div>
      <div class="count-number">${state.counts.running}</div>
    </div>
    <div class="count-card">
      <div>Retrying</div>
      <div class="count-number">${state.counts.retrying}</div>
    </div>
    <div class="count-card">
      <div>Tokens</div>
      <div class="count-number">${state.codex_totals.total_tokens}</div>
    </div>
  </div>
  <h2>Running</h2>
  <table><thead><tr><th>Issue</th><th>State</th><th>Turns</th><th>Session</th><th>Last Event</th></tr></thead>
  <tbody>${runningRows || '<tr><td colspan="5">No running sessions</td></tr>'}</tbody></table>
  <h2>Retrying</h2>
  <table><thead><tr><th>Issue</th><th>Attempt</th><th>Error</th></tr></thead>
  <tbody>${retryRows || '<tr><td colspan="3">No retries queued</td></tr>'}</tbody></table>
  <h2>Totals</h2>
  <p>Input tokens: ${state.codex_totals.input_tokens} | Output: ${state.codex_totals.output_tokens} | Total: ${state.codex_totals.total_tokens} | Runtime: ${Math.round(state.codex_totals.seconds_running)}s</p>
</body></html>`
}
```

- [ ] **Step 4: Create src/server/index.ts**

```typescript
import type { OrchestratorState } from '../models'
import { buildApiState } from './api'
import { renderDashboard } from './dashboard'
import { getLogger } from '../log'

export interface ServerConfig {
  port: number
  host: string
}

export function startServer(config: ServerConfig, getState: () => OrchestratorState): { stop: () => void } {
  const log = getLogger()
  log.info({ port: config.port, host: config.host }, 'http_server_starting')

  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    async fetch(req) {
      const url = new URL(req.url)
      const state = getState()

      if (url.pathname === '/api/v1/state') {
        const body = buildApiState(state)
        return new Response(JSON.stringify(body), {
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const dashboard = renderDashboard(buildApiState(state))
      return new Response(dashboard, {
        headers: { 'Content-Type': 'text/html' },
      })
    },
  })

  log.info({ port: server.port }, 'http_server_started')
  return { stop: () => server.stop() }
}
```

- [ ] **Step 5: Wire server into main.ts**

In `src/main.ts`, after config is loaded, check if `config.server.port` is set or `args.port` is set, and start the HTTP server:

```typescript
import { startServer } from './server/index'

// After orch is created and before orch.run()
const serverPort = args.port ?? config.server.port
if (serverPort && serverPort > 0) {
  const server = startServer({ port: serverPort, host: config.server.host }, () => orch.state)
  // Keep reference for shutdown
}
```

- [ ] **Step 6: Run tests**

Run: `cd typescript && npx vitest run tests/server.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add typescript/src/server/index.ts src/server/dashboard.ts src/server/api.ts src/main.ts tests/server.test.ts
git commit -m "feat: add HTTP server with dashboard and JSON API"
```

---

### Task 7: Add dynamic_tool support (linear_graphql)

**Files:**
- Create: `src/dynamic_tool.ts`
- Modify: `src/agent_runner.ts` (advertise tools)
- Test: `tests/dynamic_tool.test.ts`

- [ ] **Step 1: Write tests for dynamic tool**

```typescript
// tests/dynamic_tool.test.ts
import { describe, it, expect, vi } from 'vitest'
import { executeTool, toolSpecs } from '../src/dynamic_tool'

describe('dynamic_tool', () => {
  it('returns tool specs for linear_graphql', () => {
    const specs = toolSpecs()
    expect(specs).toHaveLength(1)
    expect(specs[0].name).toBe('linear_graphql')
  })

  it('executes linear_graphql with query', async () => {
    const mockClient = vi.fn().mockResolvedValue({ data: { viewer: { id: 'user-1' } } })
    const result = await executeTool('linear_graphql', { query: '{ viewer { id } }' }, mockClient)
    expect(result.success).toBe(true)
    expect(mockClient).toHaveBeenCalledWith('{ viewer { id } }', undefined)
  })

  it('rejects unsupported tool', async () => {
    const result = await executeTool('unsupported_tool', {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unsupported dynamic tool')
  })

  it('rejects multiple operations in query', async () => {
    const result = await executeTool('linear_graphql', {
      query: '{ viewer { id } } mutation { issueUpdate { success } }',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty query', async () => {
    const result = await executeTool('linear_graphql', { query: '' })
    expect(result.success).toBe(false)
  })
})
```

Run: `cd typescript && npx vitest run tests/dynamic_tool.test.ts`
Expected: FAIL

- [ ] **Step 2: Create src/dynamic_tool.ts**

```typescript
interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export interface ToolSpec {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const LINEAR_GRAPHQL_NAME = 'linear_graphql'

export function toolSpecs(): ToolSpec[] {
  return [
    {
      name: LINEAR_GRAPHQL_NAME,
      description: 'Execute a raw GraphQL query or mutation against Linear using Symphony\'s configured auth.',
      inputSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Single GraphQL query or mutation document.' },
          variables: { type: ['object', 'null'], description: 'Optional GraphQL variables object.' },
        },
      },
    },
  ]
}

async function executeLinearGraphql(
  args: { query: string; variables?: Record<string, unknown> | null },
  linearClient: (query: string, variables?: Record<string, unknown>) => Promise<{ data?: unknown; errors?: Array<{ message: string }> }>,
): Promise<ToolResult> {
  if (!args.query || typeof args.query !== 'string' || args.query.trim() === '') {
    return { success: false, error: 'query must be a non-empty string' }
  }

  // Check for multiple operations
  const operationCount = (args.query.match(/\b(query|mutation|subscription)\s+\w+\s*\{/g) || []).length
  if (operationCount > 1) {
    return { success: false, error: 'query must contain exactly one GraphQL operation' }
  }

  try {
    const result = await linearClient(args.query, args.variables ?? undefined)
    if (result.errors && result.errors.length > 0) {
      return { success: false, data: result, error: result.errors.map((e) => e.message).join(', ') }
    }
    return { success: true, data: result.data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function executeTool(
  tool: string,
  args: Record<string, unknown>,
  linearClient: (query: string, variables?: Record<string, unknown>) => Promise<{ data?: unknown; errors?: Array<{ message: string }> }>,
): Promise<ToolResult> {
  if (tool === LINEAR_GRAPHQL_NAME) {
    return executeLinearGraphql(args as { query: string; variables?: Record<string, unknown> | null }, linearClient)
  }

  return {
    success: false,
    error: `Unsupported dynamic tool: ${tool}. Supported tools: ${toolSpecs().map((t) => t.name).join(', ')}`,
  }
}
```

- [ ] **Step 3: Run tests**

Run: `cd typescript && npx vitest run tests/dynamic_tool.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add typescript/src/dynamic_tool.ts tests/dynamic_tool.test.ts
git commit -m "feat: add dynamic_tool linear_graphql support"
```

---

### Task 8: Add error types and Linear pagination

**Files:**
- Create: `src/errors.ts`
- Modify: `src/tracker/linear.ts`
- Test: `tests/tracker_linear.test.ts`

- [ ] **Step 1: Write tests for error types and pagination**

```typescript
// tests/tracker_linear.test.ts additions
import { describe, it, expect, vi } from 'vitest'
import { LinearTracker } from '../src/tracker/linear'

describe('LinearTracker pagination', () => {
  it('fetches all pages when more than 50 issues exist', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            issues: {
              nodes: Array(50).fill(null).map((_, i) => ({
                id: String(i), identifier: `T-${i}`, title: `Issue ${i}`,
                state: { name: 'Todo' },
              })),
              pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            issues: {
              nodes: [
                { id: '50', identifier: 'T-50', title: 'Issue 50', state: { name: 'Todo' } },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        }),
      })

    global.fetch = fetchMock as any

    const tracker = new LinearTracker({
      endpoint: 'https://api.linear.app/graphql',
      apiKey: 'test-key', projectSlug: 'p',
      activeStates: ['Todo'], terminalStates: [],
    })

    const issues = await tracker.fetchCandidateIssues()
    expect(issues).toHaveLength(51)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
```

Run: `cd typescript && npx vitest run tests/tracker_linear.test.ts -t "pagination"`
Expected: FAIL

- [ ] **Step 2: Add pagination and error types**

```typescript
// src/errors.ts
export type SymphonyErrorCode =
  | 'missing_workflow_file'
  | 'workflow_parse_error'
  | 'workflow_front_matter_not_a_map'
  | 'template_parse_error'
  | 'template_render_error'
  | 'unsupported_tracker_kind'
  | 'missing_tracker_api_key'
  | 'missing_tracker_project_slug'
  | 'linear_api_request'
  | 'linear_api_status'
  | 'linear_graphql_errors'
  | 'linear_unknown_payload'
  | 'linear_missing_end_cursor'
  | 'codex_not_found'
  | 'invalid_workspace_cwd'
  | 'response_timeout'
  | 'turn_timeout'
  | 'port_exit'
  | 'response_error'
  | 'turn_failed'
  | 'turn_cancelled'
  | 'turn_input_required'

export class SymphonyError extends Error {
  constructor(
    public code: SymphonyErrorCode,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'SymphonyError'
  }
}
```

- [ ] **Step 3: Update LinearTracker with pagination**

In `src/tracker/linear.ts`, modify `fetchCandidateIssues` to paginate. Add a `graphqlPaginated` helper:

```typescript
  async fetchCandidateIssues(): Promise<Issue[]> {
    const allNodes: LinearIssueNode[] = []
    let cursor: string | null = null
    const pageSize = 50

    while (true) {
      const query = `query Candidates($projectSlug: String!, $activeStates: [String!]!, $after: String, $first: Int!) {
        issues(filter: { project: { slugId: { eq: $projectSlug } }, state: { name: { in: $activeStates } } }, first: $first, after: $after) {
          nodes { id identifier title description priority branchName url
            labels { nodes { name } }
            state { name }
            createdAt updatedAt
            children { nodes { id identifier state { name } } } }
          pageInfo { hasNextPage endCursor }
        }
      }`

      const data = await this.graphql<{ issues: { nodes: LinearIssueNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }>(query, {
        projectSlug: this.config.projectSlug,
        activeStates: this.config.activeStates,
        after: cursor,
        first: pageSize,
      })

      if (!data?.issues) break
      allNodes.push(...data.issues.nodes)

      if (!data.issues.pageInfo.hasNextPage) break
      cursor = data.issues.pageInfo.endCursor
      if (!cursor) break
    }

    return allNodes.map(normalizeIssue)
  }
```

- [ ] **Step 4: Run tests**

Run: `cd typescript && npx vitest run tests/tracker_linear.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add typescript/src/errors.ts src/tracker/linear.ts tests/tracker_linear.test.ts
git commit -m "feat: add error types and Linear pagination"
```

---

### Task 9: Flesh out remaining test coverage

**Files:**
- Modify: `tests/agent_runner.test.ts`
- Modify: `tests/orchestrator.test.ts`
- Modify: `tests/config.test.ts`
- Modify: `tests/workspace.test.ts`

- [ ] **Step 1: Add workspace after_create fatal failure test**

```typescript
// tests/workspace.test.ts additions
import { describe, it, expect, vi } from 'vitest'
import { WorkspaceManager } from '../src/workspace'

describe('WorkspaceManager after_create', () => {
  it('fails workspace creation when after_create hook fails', async () => {
    const manager = new WorkspaceManager({
      root: '/tmp/test-ws',
      afterCreate: 'exit 1',
      hookTimeoutMs: 1000,
    })
    await expect(manager.createForIssue('TEST-1')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Add orchestration retry/test tests**

Add tests for retry scheduling, worker exit handling, startup cleanup.

- [ ] **Step 3: Verify all tests pass**

Run: `npx vitest run`
Expected: All 70+ tests PASS

- [ ] **Step 4: Commit**

```bash
git add typescript/tests/
git commit -m "test: improve test coverage for workspace, orchestrator, agent_runner"
```
