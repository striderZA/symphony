# Symphony OpenCode Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Python Symphony implementation from Codex app-server integration to OpenCode server integration, rewritten in TypeScript.

**Architecture:** Central `opencode serve` as the agent runtime. Symphony connects via `@opencode-ai/sdk` HTTP client, creates one OpenCode session per issue, sends rendered prompts, and polls for completion. Same orchestrator state machine as Python, but worker creation/monitoring uses HTTP API instead of subprocess.

**Tech Stack:** TypeScript (Bun), `@opencode-ai/sdk`, Zod, pino, vitest, `js-yaml`, `liquidjs` or handlebars

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/.gitkeep`
- Create: `tests/.gitkeep`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "symphony",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "bun src/main.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@opencode-ai/sdk": "^1.0.0",
    "zod": "^3.23.0",
    "js-yaml": "^4.1.0",
    "pino": "^9.0.0",
    "liquidjs": "^10.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^1.6.0",
    "@types/node": "^20.0.0",
    "@types/js-yaml": "^4.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create directories and install**

Run: `mkdir -p src/tracker src/server tests .opencode/plugins && bun install`
Expected: `node_modules/` created, no errors

- [ ] **Step 4: Commit**

```bash
git add package.json tsconfig.json src/.gitkeep tests/.gitkeep
git commit -m "chore(opencode): scaffold TypeScript project"
```

---

### Task 2: Domain Models

**Files:**
- Create: `src/models.ts`

- [ ] **Step 1: Write models.ts**

```typescript
export interface BlockerRef {
  id: string | null
  identifier: string | null
  state: string | null
}

export interface Issue {
  id: string
  identifier: string
  title: string
  state: string
  description: string | null
  priority: number | null
  branchName: string | null
  url: string | null
  labels: string[]
  blockedBy: BlockerRef[]
  createdAt: Date | null
  updatedAt: Date | null
}

export interface WorkflowDefinition {
  config: Record<string, unknown>
  promptTemplate: string
}

export interface Workspace {
  path: string
  workspaceKey: string
  createdNow: boolean
}

export interface RetryEntry {
  issueId: string
  identifier: string
  attempt: number
  dueAtMs: number
  error: string | null
}

export interface RunningEntry {
  issueId: string
  identifier: string
  issue: Issue
  sessionId: string | null
  lastCodexEvent: string | null
  lastCodexTimestamp: Date | null
  lastCodexMessage: string
  codexInputTokens: number
  codexOutputTokens: number
  codexTotalTokens: number
  lastReportedInputTokens: number
  lastReportedOutputTokens: number
  lastReportedTotalTokens: number
  retryAttempt: number
  startedAt: Date | null
  task: Promise<void> | null
  cancel: (() => void) | null
}

export interface CodexTotals {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  secondsRunning: number
}

export function createCodexTotals(): CodexTotals {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, secondsRunning: 0 }
}

export interface OrchestratorState {
  pollIntervalMs: number
  maxConcurrentAgents: number
  running: Map<string, RunningEntry>
  claimed: Set<string>
  retryAttempts: Map<string, RetryEntry>
  completed: Set<string>
  codexTotals: CodexTotals
  codexRateLimits: unknown
  maxConcurrentAgentsByState: Record<string, number>
}

export function createOrchestratorState(overrides?: Partial<OrchestratorState>): OrchestratorState {
  return {
    pollIntervalMs: 30000,
    maxConcurrentAgents: 10,
    running: new Map(),
    claimed: new Set(),
    retryAttempts: new Map(),
    completed: new Set(),
    codexTotals: createCodexTotals(),
    codexRateLimits: null,
    maxConcurrentAgentsByState: {},
    ...overrides,
  }
}
```

- [ ] **Step 2: Write and run test**

Run: `cat > tests/models.test.ts << 'EOF'`
```typescript
import { describe, it, expect } from 'vitest'
import { createOrchestratorState, createCodexTotals, type Issue, type RetryEntry } from '../src/models'

describe('models', () => {
  it('creates default orchestrator state', () => {
    const state = createOrchestratorState()
    expect(state.maxConcurrentAgents).toBe(10)
    expect(state.pollIntervalMs).toBe(30000)
    expect(state.running.size).toBe(0)
    expect(state.claimed.size).toBe(0)
    expect(state.retryAttempts.size).toBe(0)
    expect(state.completed.size).toBe(0)
    expect(state.codexTotals.inputTokens).toBe(0)
    expect(state.codexTotals.secondsRunning).toBe(0)
  })

  it('creates orchestrator state with overrides', () => {
    const state = createOrchestratorState({ maxConcurrentAgents: 5 })
    expect(state.maxConcurrentAgents).toBe(5)
  })

  it('creates zeroed codex totals', () => {
    const t = createCodexTotals()
    expect(t.inputTokens).toBe(0)
    expect(t.outputTokens).toBe(0)
    expect(t.totalTokens).toBe(0)
    expect(t.secondsRunning).toBe(0)
  })
})
```

Run: `bun vitest run tests/models.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/models.ts tests/models.test.ts
git commit -m "feat(opencode): add domain models"
```

---

### Task 3: Path Safety Utility

**Files:**
- Create: `src/path_safety.ts`
- Create: `tests/path_safety.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { sanitizeWorkspaceKey, checkContainment } from '../src/path_safety'
import path from 'node:path'
import os from 'node:os'

describe('path_safety', () => {
  describe('sanitizeWorkspaceKey', () => {
    it('passes through valid keys', () => {
      expect(sanitizeWorkspaceKey('ABC-123')).toBe('ABC-123')
      expect(sanitizeWorkspaceKey('my_issue.1')).toBe('my_issue.1')
      expect(sanitizeWorkspaceKey('test-branch')).toBe('test-branch')
    })

    it('replaces invalid characters with underscore', () => {
      expect(sanitizeWorkspaceKey('ABC:123')).toBe('ABC_123')
      expect(sanitizeWorkspaceKey('hello world')).toBe('hello_world')
      expect(sanitizeWorkspaceKey('a/b/c')).toBe('a_b_c')
    })

    it('handles empty string', () => {
      expect(sanitizeWorkspaceKey('')).toBe('')
    })
  })

  describe('checkContainment', () => {
    it('accepts path inside root', () => {
      expect(() => checkContainment('/root/workspace', '/root')).not.toThrow()
    })

    it('rejects path outside root', () => {
      expect(() => checkContainment('/outside', '/root')).toThrow('not contained within workspace root')
    })

    it('rejects path at same level as root', () => {
      expect(() => checkContainment('/other', '/root')).toThrow()
    })

    it('accepts nested paths inside root', () => {
      expect(() => checkContainment('/root/a/b/c', '/root')).not.toThrow()
    })
  })
})
```

Run: `bun vitest run tests/path_safety.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 2: Write minimal implementation**

```typescript
import path from 'node:path'

export function sanitizeWorkspaceKey(identifier: string): string {
  return identifier.replace(/[^A-Za-z0-9._-]/g, '_')
}

export function checkContainment(workspacePath: string, workspaceRoot: string): void {
  const absPath = path.resolve(workspacePath)
  const absRoot = path.resolve(workspaceRoot)
  const relative = path.relative(absRoot, absPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path ${absPath} is not contained within workspace root ${absRoot}`)
  }
}
```

Run: `bun vitest run tests/path_safety.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/path_safety.ts tests/path_safety.test.ts
git commit -m "feat(opencode): add path safety utility"
```

---

### Task 4: Logging Setup

**Files:**
- Create: `src/log.ts`

- [ ] **Step 1: Write log.ts**

```typescript
import pino from 'pino'

let logger: pino.Logger = pino({
  level: process.env.SYMPHONY_LOG_LEVEL || 'info',
  transport: process.stdout.isTTY
    ? { target: 'pino/file', options: { destination: 1 } }
    : undefined,
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
```

- [ ] **Step 2: Write and run test**

```typescript
import { describe, it, expect } from 'vitest'
import { configureLogging, getLogger } from '../src/log'

describe('log', () => {
  it('returns a logger', () => {
    const log = getLogger()
    expect(log).toBeDefined()
    expect(typeof log.info).toBe('function')
  })

  it('can be reconfigured', () => {
    configureLogging({ level: 'debug' })
    const log = getLogger()
    expect(log.level).toBe('debug')
  })
})
```

Run: `bun vitest run tests/log.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/log.ts tests/log.test.ts
git commit -m "feat(opencode): add structured logging with pino"
```

---

### Task 5: Workflow Loader

**Files:**
- Create: `src/workflow.ts`
- Create: `tests/workflow.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { loadWorkflow } from '../src/workflow'
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let tmpDir: string

beforeAll(() => {
  tmpDir = join(tmpdir(), `symphony-test-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })
})

afterAll(() => {
  unlinkSync(join(tmpDir, 'WORKFLOW.md'))
})

describe('loadWorkflow', () => {
  it('loads workflow with front matter and prompt body', () => {
    writeFileSync(join(tmpDir, 'WORKFLOW.md'), `---
tracker:
  kind: linear
  project_slug: my-project
agent:
  max_concurrent_agents: 5
---

You are working on {{ issue.identifier }}: {{ issue.title }}.
`)
    const wf = loadWorkflow(join(tmpDir, 'WORKFLOW.md'))
    expect(wf.config).toEqual({
      tracker: { kind: 'linear', project_slug: 'my-project' },
      agent: { max_concurrent_agents: 5 },
    })
    expect(wf.promptTemplate).toBe('You are working on {{ issue.identifier }}: {{ issue.title }}.')
  })

  it('handles file without front matter', () => {
    writeFileSync(join(tmpDir, 'WORKFLOW.md'), 'Just a prompt body.')
    const wf = loadWorkflow(join(tmpDir, 'WORKFLOW.md'))
    expect(wf.config).toEqual({})
    expect(wf.promptTemplate).toBe('Just a prompt body.')
  })

  it('throws on missing file', () => {
    expect(() => loadWorkflow('/nonexistent/WORKFLOW.md')).toThrow('Workflow file not found')
  })

  it('throws on non-map front matter', () => {
    writeFileSync(join(tmpDir, 'WORKFLOW.md'), "---\n42\n---\nbody")
    expect(() => loadWorkflow(join(tmpDir, 'WORKFLOW.md'))).toThrow('YAML front matter must decode to a map')
  })

  it('defaults to ./WORKFLOW.md when path is null', () => {
    expect(() => loadWorkflow(null)).toThrow('Workflow file not found')
  })
})
```

Run: `bun vitest run tests/workflow.test.ts`
Expected: FAIL

- [ ] **Step 2: Write minimal implementation**

```typescript
import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { load as yamlLoad } from 'js-yaml'
import type { WorkflowDefinition } from './models'

export function loadWorkflow(path: string | null): WorkflowDefinition {
  const resolvedPath = path ? resolve(path) : join(process.cwd(), 'WORKFLOW.md')

  if (!existsSync(resolvedPath)) {
    throw new Error(`Workflow file not found: ${resolvedPath}`)
  }

  const raw = readFileSync(resolvedPath, 'utf-8')
  const { config, promptBody } = splitFrontMatter(raw)

  const validatedConfig = config !== null ? config : {}
  if (validatedConfig !== null && (typeof validatedConfig !== 'object' || Array.isArray(validatedConfig))) {
    throw new Error('YAML front matter must decode to a map/object')
  }

  return {
    config: validatedConfig as Record<string, unknown>,
    promptTemplate: promptBody.trim(),
  }
}

function splitFrontMatter(raw: string): { config: unknown; promptBody: string } {
  if (!raw.startsWith('---')) {
    return { config: null, promptBody: raw }
  }

  const rest = raw.slice(3)
  const endIdx = rest.indexOf('\n---')
  if (endIdx === -1) {
    return { config: null, promptBody: raw }
  }

  const yamlText = rest.slice(0, endIdx)
  const body = rest.slice(endIdx + 4)

  const config = yamlLoad(yamlText)
  return { config, promptBody: body }
}
```

Run: `bun vitest run tests/workflow.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/workflow.ts tests/workflow.test.ts
git commit -m "feat(opencode): add WORKFLOW.md loader"
```

---

### Task 6: Config Layer

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { buildServiceConfig } from '../src/config'
import type { WorkflowDefinition } from '../src/models'

describe('buildServiceConfig', () => {
  it('builds config with defaults for missing fields', () => {
    const wf: WorkflowDefinition = { config: {}, promptTemplate: 'test' }
    const cfg = buildServiceConfig(wf)
    expect(cfg.tracker.kind).toBe('')
    expect(cfg.tracker.endpoint).toBe('')
    expect(cfg.polling.intervalMs).toBe(30000)
    expect(cfg.agent.maxConcurrentAgents).toBe(10)
    expect(cfg.agent.maxTurns).toBe(20)
    expect(cfg.agent.maxRetryBackoffMs).toBe(300000)
    expect(cfg.opencode.serverUrl).toBe('http://localhost:4096')
    expect(cfg.opencode.serverStartCommand).toBeNull()
    expect(cfg.opencode.stallTimeoutMs).toBe(300000)
    expect(cfg.opencode.sessionTimeoutMs).toBe(3600000)
    expect(cfg.hooks.timeoutMs).toBe(60000)
  })

  it('resolves $VAR references from environment', () => {
    process.env.TEST_API_KEY = 'secret-123'
    const wf: WorkflowDefinition = {
      config: { tracker: { api_key: '$TEST_API_KEY', kind: 'linear', project_slug: 'proj' } },
      promptTemplate: '',
    }
    const cfg = buildServiceConfig(wf)
    expect(cfg.tracker.apiKey).toBe('secret-123')
  })

  it('parses tracker config', () => {
    const wf: WorkflowDefinition = {
      config: {
        tracker: { kind: 'linear', project_slug: 'my-project', active_states: ['In Progress'] },
      },
      promptTemplate: '',
    }
    const cfg = buildServiceConfig(wf)
    expect(cfg.tracker.kind).toBe('linear')
    expect(cfg.tracker.projectSlug).toBe('my-project')
    expect(cfg.tracker.activeStates).toEqual(['In Progress'])
  })

  it('parses opencode config', () => {
    const wf: WorkflowDefinition = {
      config: {
        opencode: {
          server_url: 'http://localhost:4097',
          server_start_command: 'opencode serve --port 4097',
          stall_timeout_ms: 60000,
          session_timeout_ms: 1800000,
        },
      },
      promptTemplate: '',
    }
    const cfg = buildServiceConfig(wf)
    expect(cfg.opencode.serverUrl).toBe('http://localhost:4097')
    expect(cfg.opencode.serverStartCommand).toBe('opencode serve --port 4097')
    expect(cfg.opencode.stallTimeoutMs).toBe(60000)
    expect(cfg.opencode.sessionTimeoutMs).toBe(1800000)
  })

  it('builds default endpoint for linear tracker', () => {
    const wf: WorkflowDefinition = {
      config: { tracker: { kind: 'linear' } },
      promptTemplate: '',
    }
    const cfg = buildServiceConfig(wf)
    expect(cfg.tracker.endpoint).toBe('https://api.linear.app/graphql')
  })

  it('validates dispatch preflight', () => {
    const wf: WorkflowDefinition = { config: {}, promptTemplate: '' }
    const cfg = buildServiceConfig(wf)
    const errors = cfg.validateDispatch()
    expect(errors.length).toBeGreaterThan(0)
    expect(errors).toContain('tracker.kind is required')
  })
})
```

Run: `bun vitest run tests/config.test.ts`
Expected: FAIL

- [ ] **Step 2: Write minimal implementation**

```typescript
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { WorkflowDefinition } from './models'

const VAR_PATTERN = /^\$(\w+)$/

function resolveVar(value: string, env: Record<string, string | undefined>): string {
  const m = VAR_PATTERN.exec(value)
  if (m) {
    return env[m[1]] ?? ''
  }
  return value
}

function expandPath(value: string, workflowDir?: string): string {
  let expanded = value.replace(/^~/, process.env.HOME || process.env.USERPROFILE || '')
  if (workflowDir && !expanded.startsWith('/') && !expanded.match(/^[A-Za-z]:\\/)) {
    expanded = join(workflowDir, expanded)
  }
  return expanded
}

export interface TrackerConfig {
  kind: string
  endpoint: string
  apiKey: string
  projectSlug: string
  activeStates: string[]
  terminalStates: string[]
}

export interface PollingConfig {
  intervalMs: number
}

export interface WorkspaceConfig {
  root: string
}

export interface HooksConfig {
  afterCreate: string | null
  beforeRun: string | null
  afterRun: string | null
  beforeRemove: string | null
  timeoutMs: number
}

export interface AgentConfig {
  maxConcurrentAgents: number
  maxTurns: number
  maxRetryBackoffMs: number
  maxConcurrentAgentsByState: Record<string, number>
}

export interface OpenCodeConfig {
  serverUrl: string
  serverStartCommand: string | null
  stallTimeoutMs: number
  sessionTimeoutMs: number
}

export interface ServiceConfig {
  tracker: TrackerConfig
  polling: PollingConfig
  workspace: WorkspaceConfig
  hooks: HooksConfig
  agent: AgentConfig
  opencode: OpenCodeConfig
}

export function buildServiceConfig(wf: WorkflowDefinition, workflowDir?: string, envOverrides?: Record<string, string | undefined>): ServiceConfig {
  const env = envOverrides ?? process.env as Record<string, string | undefined>
  const raw = wf.config

  // Tracker
  const trackerRaw = (raw.tracker as Record<string, unknown>) ?? {}
  const kind = String(trackerRaw.kind ?? '')
  let endpoint = String(trackerRaw.endpoint ?? '')
  if (!endpoint && kind === 'linear') {
    endpoint = 'https://api.linear.app/graphql'
  }
  const apiKey = resolveVar(String(trackerRaw.api_key ?? ''), env)
  const projectSlug = String(trackerRaw.project_slug ?? '')
  const activeStates = (trackerRaw.active_states as string[]) ?? ['Todo', 'In Progress']
  const terminalStates = (trackerRaw.terminal_states as string[]) ?? ['Closed', 'Cancelled', 'Canceled', 'Duplicate', 'Done']

  // Polling
  const pollRaw = (raw.polling as Record<string, unknown>) ?? {}
  const intervalMs = (pollRaw.interval_ms as number) ?? 30000

  // Workspace
  const wsRaw = (raw.workspace as Record<string, unknown>) ?? {}
  const wsRoot = wsRaw.root
    ? expandPath(String(wsRaw.root), workflowDir)
    : join(tmpdir(), 'symphony_workspaces')

  // Hooks
  const hRaw = (raw.hooks as Record<string, unknown>) ?? {}
  const hooks: HooksConfig = {
    afterCreate: (hRaw.after_create as string) ?? null,
    beforeRun: (hRaw.before_run as string) ?? null,
    afterRun: (hRaw.after_run as string) ?? null,
    beforeRemove: (hRaw.before_remove as string) ?? null,
    timeoutMs: (hRaw.timeout_ms as number) ?? 60000,
  }

  // Agent
  const aRaw = (raw.agent as Record<string, unknown>) ?? {}
  const perState: Record<string, number> = {}
  const rawPerState = (aRaw.max_concurrent_agents_by_state as Record<string, unknown>) ?? {}
  for (const [k, v] of Object.entries(rawPerState)) {
    if (typeof v === 'number' && v > 0) {
      perState[k.toLowerCase()] = v
    }
  }
  const agent: AgentConfig = {
    maxConcurrentAgents: (aRaw.max_concurrent_agents as number) ?? 10,
    maxTurns: (aRaw.max_turns as number) ?? 20,
    maxRetryBackoffMs: (aRaw.max_retry_backoff_ms as number) ?? 300000,
    maxConcurrentAgentsByState: perState,
  }

  // OpenCode
  const oRaw = (raw.opencode as Record<string, unknown>) ?? {}
  const opencode: OpenCodeConfig = {
    serverUrl: (oRaw.server_url as string) ?? 'http://localhost:4096',
    serverStartCommand: (oRaw.server_start_command as string) ?? null,
    stallTimeoutMs: (oRaw.stall_timeout_ms as number) ?? 300000,
    sessionTimeoutMs: (oRaw.session_timeout_ms as number) ?? 3600000,
  }

  return {
    tracker: {
      kind, endpoint, apiKey, projectSlug,
      activeStates: [...activeStates],
      terminalStates: [...terminalStates],
    },
    polling: { intervalMs },
    workspace: { root: wsRoot },
    hooks,
    agent,
    opencode,
  }
}

export function validateDispatchConfig(cfg: ServiceConfig): string[] {
  const errors: string[] = []
  if (!cfg.tracker.kind) {
    errors.push('tracker.kind is required')
  } else if (cfg.tracker.kind !== 'linear') {
    errors.push(`unsupported tracker.kind: ${cfg.tracker.kind}`)
  }
  if (!cfg.tracker.apiKey) {
    errors.push('tracker.api_key is missing or empty')
  }
  if (cfg.tracker.kind === 'linear' && !cfg.tracker.projectSlug) {
    errors.push('tracker.project_slug is required for linear tracker')
  }
  return errors
}
```

Run: `bun vitest run tests/config.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat(opencode): add config layer with Zod validation"
```

---

### Task 7: Shell Hook Execution

**Files:**
- Create: `src/hooks.ts`
- Create: `tests/hooks.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { execHook } from '../src/hooks'

describe('execHook', () => {
  it('executes a simple command and returns success', async () => {
    const result = await execHook('echo hello', '/tmp', 5000)
    expect(result.success).toBe(true)
  })

  it('fails on non-zero exit', async () => {
    const result = await execHook('exit 1', '/tmp', 5000)
    expect(result.success).toBe(false)
  })

  it('times out when command exceeds limit', async () => {
    const result = await execHook('sleep 10', '/tmp', 100)
    expect(result.success).toBe(false)
    expect(result.error).toContain('timed out')
  })
})
```

Run: `bun vitest run tests/hooks.test.ts`
Expected: FAIL

- [ ] **Step 2: Write minimal implementation**

```typescript
import { exec } from 'node:child_process'

export interface HookResult {
  success: boolean
  stdout: string
  stderr: string
  error: string | null
}

export function execHook(command: string, cwd: string, timeoutMs: number): Promise<HookResult> {
  return new Promise((resolve) => {
    const child = exec(command, { cwd, timeout: timeoutMs, shell: true }, (err, stdout, stderr) => {
      if (err) {
        const isTimeout = err.killed || err.message.includes('timeout')
        resolve({
          success: false,
          stdout,
          stderr,
          error: isTimeout ? `Hook timed out after ${timeoutMs}ms` : err.message,
        })
      } else {
        resolve({ success: true, stdout, stderr, error: null })
      }
    })
  })
}
```

Run: `bun vitest run tests/hooks.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/hooks.ts tests/hooks.test.ts
git commit -m "feat(opencode): add shell hook execution with timeout"
```

---

### Task 8: Workflow Store (File Watching)

**Files:**
- Create: `src/workflow_store.ts`
- Create: `tests/workflow_store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WorkflowStore } from '../src/workflow_store'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let testDir: string

beforeEach(() => {
  testDir = join(tmpdir(), `symphony-ws-${Date.now()}`)
  mkdirSync(testDir, { recursive: true })
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})

describe('WorkflowStore', () => {
  it('loads workflow file on creation', () => {
    writeFileSync(join(testDir, 'WORKFLOW.md'), '---\ntracker:\n  kind: linear\n---\n\nDo work.')
    const store = new WorkflowStore(join(testDir, 'WORKFLOW.md'))
    expect(store.workflow).not.toBeNull()
    expect(store.config.tracker.kind).toBe('linear')
  })

  it('returns null workflow for missing file', () => {
    const store = new WorkflowStore('/nonexistent/WORKFLOW.md')
    expect(store.workflow).toBeNull()
    expect(store.lastError).toContain('not found')
  })

  it('detects file changes (onChange callback)', async () => {
    writeFileSync(join(testDir, 'WORKFLOW.md'), '---\nagent:\n  max_concurrent_agents: 5\n---\nbody')
    const store = new WorkflowStore(join(testDir, 'WORKFLOW.md'))

    await new Promise<void>((resolve) => {
      store.onChange = () => resolve()
      // Trigger a change
      setTimeout(() => {
        writeFileSync(join(testDir, 'WORKFLOW.md'), '---\nagent:\n  max_concurrent_agents: 10\n---\nbody')
      }, 100)
    })

    expect(store.config.agent.maxConcurrentAgents).toBe(10)
  })
})
```

Run: `bun vitest run tests/workflow_store.test.ts`
Expected: FAIL

- [ ] **Step 2: Write minimal implementation**

```typescript
import { watch, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadWorkflow } from './workflow'
import { buildServiceConfig } from './config'
import type { WorkflowDefinition } from './models'
import type { ServiceConfig } from './config'
import { getLogger } from './log'

export class WorkflowStore {
  private path: string
  private wfDir: string | undefined
  workflow: WorkflowDefinition | null = null
  config: ServiceConfig | null = null
  lastError: string | null = null
  onChange: (() => void) | null = null
  private watcher: ReturnType<typeof watch> | null = null

  constructor(wfPath: string | null) {
    this.path = wfPath ? resolve(wfPath) : resolve(process.cwd(), 'WORKFLOW.md')
    this.wfDir = wfPath ? resolve(wfPath).split('/').slice(0, -1).join('/') || undefined : undefined
    this.reload()

    try {
      this.watcher = watch(this.path, (eventType) => {
        if (eventType === 'change') {
          getLogger().info('workflow_file_changed')
          this.reload()
          this.onChange?.()
        }
      })
    } catch {
      getLogger().warn('file_watching_unavailable')
    }
  }

  private reload(): void {
    try {
      this.workflow = loadWorkflow(this.path)
      this.config = buildServiceConfig(this.workflow, this.wfDir)
      this.lastError = null
    } catch (err) {
      this.workflow = null
      this.config = null
      this.lastError = err instanceof Error ? err.message : String(err)
      getLogger().error({ error: this.lastError }, 'workflow_reload_failed')
    }
  }

  close(): void {
    this.watcher?.close()
    this.watcher = null
  }
}
```

- [ ] **Step 3: Run tests**

Run: `bun vitest run tests/workflow_store.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/workflow_store.ts tests/workflow_store.test.ts
git commit -m "feat(opencode): add workflow store with file watching"
```

---

### Task 9: Prompt Builder

**Files:**
- Create: `src/prompt_builder.ts`
- Create: `tests/prompt_builder.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { renderPrompt } from '../src/prompt_builder'
import type { Issue } from '../src/models'

const testIssue: Issue = {
  id: 'abc-123',
  identifier: 'MT-649',
  title: 'Fix login bug',
  state: 'In Progress',
  description: 'Users cannot log in',
  priority: 1,
  branchName: null,
  url: 'https://linear.app/issue/MT-649',
  labels: ['bug', 'auth'],
  blockedBy: [],
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-02'),
}

describe('renderPrompt', () => {
  it('renders basic issue variables', () => {
    const result = renderPrompt('Work on {{ issue.identifier }}: {{ issue.title }}.', testIssue, null)
    expect(result).toBe('Work on MT-649: Fix login bug.')
  })

  it('renders with attempt', () => {
    const result = renderPrompt('Attempt {{ attempt }}.', testIssue, 2)
    expect(result).toBe('Attempt 2.')
  })

  it('fails on unknown variable', () => {
    expect(() => renderPrompt('{{ unknown_var }}', testIssue, null)).toThrow()
  })

  it('renders labels as iterable list', () => {
    const result = renderPrompt('Labels: {% for l in issue.labels %}{{ l }},{% endfor %}', testIssue, null)
    expect(result).toContain('bug')
    expect(result).toContain('auth')
  })
})
```

Run: `bun vitest run tests/prompt_builder.test.ts`
Expected: FAIL

- [ ] **Step 2: Write minimal implementation**

```typescript
import { Liquid } from 'liquidjs'
import type { Issue } from './models'

const engine = new Liquid({
  strictVariables: true,
  strictFilters: true,
})

export function renderPrompt(template: string, issue: Issue, attempt: number | null): string {
  const ctx: Record<string, unknown> = {
    issue: {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      state: issue.state,
      description: issue.description,
      priority: issue.priority,
      branch_name: issue.branchName,
      url: issue.url,
      labels: issue.labels,
      blocked_by: issue.blockedBy.map((b) => ({
        id: b.id,
        identifier: b.identifier,
        state: b.state,
      })),
      created_at: issue.createdAt?.toISOString() ?? null,
      updated_at: issue.updatedAt?.toISOString() ?? null,
    },
    attempt: attempt ?? null,
  }

  return engine.parseAndRenderSync(template, ctx)
}
```

Run: `bun vitest run tests/prompt_builder.test.ts`
Expected: All tests PASS (may need to adjust template syntax — liquidjs uses `{% for %}` which should work)

- [ ] **Step 3: Commit**

```bash
git add src/prompt_builder.ts tests/prompt_builder.test.ts
git commit -m "feat(opencode): add prompt builder with strict liquidjs"
```

---

### Task 9: Tracker Adapter Interface + Memory Adapter

**Files:**
- Create: `src/tracker/base.ts`
- Create: `src/tracker/memory.ts`
- Create: `tests/tracker_memory.test.ts`

- [ ] **Step 1: Write base interface**

```typescript
import type { Issue } from '../models'

export interface TrackerAdapter {
  fetchCandidateIssues(): Promise<Issue[]>
  fetchIssuesByStates(stateNames: string[]): Promise<Issue[]>
  fetchIssueStatesByIds(issueIds: string[]): Promise<Issue[]>
}
```

- [ ] **Step 2: Write memory tracker with TDD**

```typescript
// tests/tracker_memory.test.ts
import { describe, it, expect } from 'vitest'
import { MemoryTracker } from '../src/tracker/memory'
import type { Issue } from '../src/models'

describe('MemoryTracker', () => {
  it('returns candidate issues in active states', () => {
    const t = new MemoryTracker(['Todo', 'In Progress'])
    t.addIssue({ id: '1', identifier: 'A-1', title: 't1', state: 'Todo' } as Issue)
    t.addIssue({ id: '2', identifier: 'A-2', title: 't2', state: 'Done' } as Issue)
    const candidates = t.fetchCandidateIssues()
    expect(candidates).toHaveLength(1)
    expect(candidates[0].id).toBe('1')
  })

  it('returns issues by state names', () => {
    const t = new MemoryTracker()
    t.addIssue({ id: '1', identifier: 'A-1', title: 't1', state: 'Done' } as Issue)
    t.addIssue({ id: '2', identifier: 'A-2', title: 't2', state: 'Closed' } as Issue)
    const results = t.fetchIssuesByStates(['Done'])
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('1')
  })

  it('returns issue states by ids', () => {
    const t = new MemoryTracker()
    t.addIssue({ id: '1', identifier: 'A-1', title: 't1', state: 'Todo' } as Issue)
    const results = t.fetchIssueStatesByIds(['1'])
    expect(results).toHaveLength(1)
    expect(results[0].state).toBe('Todo')
  })

  it('returns empty array for unknown ids', () => {
    const t = new MemoryTracker()
    expect(t.fetchIssueStatesByIds(['nonexistent'])).toEqual([])
  })
})
```

```typescript
// src/tracker/memory.ts
import type { Issue } from '../models'
import type { TrackerAdapter } from './base'

export class MemoryTracker implements TrackerAdapter {
  private issues: Map<string, Issue> = new Map()

  constructor(private activeStates: string[] = ['Todo', 'In Progress']) {}

  addIssue(issue: Issue): void {
    this.issues.set(issue.id, issue)
  }

  async fetchCandidateIssues(): Promise<Issue[]> {
    return Array.from(this.issues.values()).filter((i) =>
      this.activeStates.includes(i.state)
    )
  }

  async fetchIssuesByStates(stateNames: string[]): Promise<Issue[]> {
    return Array.from(this.issues.values()).filter((i) =>
      stateNames.includes(i.state)
    )
  }

  async fetchIssueStatesByIds(issueIds: string[]): Promise<Issue[]> {
    return issueIds
      .map((id) => this.issues.get(id))
      .filter((i): i is Issue => i !== undefined)
  }
}
```

Run: `bun vitest run tests/tracker_memory.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/tracker/base.ts src/tracker/memory.ts tests/tracker_memory.test.ts
git commit -m "feat(opencode): add tracker interface and memory adapter"
```

---

### Task 10: Linear Tracker

**Files:**
- Create: `src/tracker/linear.ts`
- Create: `tests/tracker_linear.test.ts`

- [ ] **Step 1: Write Linear GraphQL client**

```typescript
import type { Issue, BlockerRef } from '../models'
import type { TrackerAdapter } from './base'

interface LinearConfig {
  endpoint: string
  apiKey: string
  projectSlug: string
  activeStates: string[]
  terminalStates: string[]
}

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

interface LinearIssueNode {
  id: string
  identifier: string
  title: string
  description?: string | null
  priority?: number | null
  branchName?: string | null
  url?: string | null
  labels?: { nodes?: Array<{ name: string }> }
  state?: { name: string }
  project?: { slugId?: string } | null
  createdAt?: string
  updatedAt?: string
  children?: { nodes?: Array<{ id: string; identifier: string; state?: { name: string } }> }
}

function normalizeIssue(node: LinearIssueNode): Issue {
  const blockers: BlockerRef[] = (node.children?.nodes ?? []).map((c) => ({
    id: c.id ?? null,
    identifier: c.identifier ?? null,
    state: c.state?.name ?? null,
  }))

  return {
    id: node.id,
    identifier: node.identifier,
    title: node.title,
    state: node.state?.name ?? 'Unknown',
    description: node.description ?? null,
    priority: typeof node.priority === 'number' ? node.priority : null,
    branchName: node.branchName ?? null,
    url: node.url ?? null,
    labels: (node.labels?.nodes ?? []).map((l) => l.name.toLowerCase()),
    blockedBy: blockers,
    createdAt: node.createdAt ? new Date(node.createdAt) : null,
    updatedAt: node.updatedAt ? new Date(node.updatedAt) : null,
  }
}

export class LinearTracker implements TrackerAdapter {
  constructor(private config: LinearConfig) {}

  async fetchCandidateIssues(): Promise<Issue[]> {
    const query = `
      query Candidates($projectSlug: String!, $activeStates: [String!]!) {
        issues(
          filter: {
            project: { slugId: { eq: $projectSlug } }
            state: { name: { in: $activeStates } }
          }
          first: 50
        ) {
          nodes {
            id identifier title description priority branchName url
            labels { nodes { name } }
            state { name }
            createdAt updatedAt
            children { nodes { id identifier state { name } } }
          }
        }
      }
    `
    const data = await this.graphql<{ issues: { nodes: LinearIssueNode[] } }>(query, {
      projectSlug: this.config.projectSlug,
      activeStates: this.config.activeStates,
    })
    return (data?.issues?.nodes ?? []).map(normalizeIssue)
  }

  async fetchIssuesByStates(stateNames: string[]): Promise<Issue[]> {
    const query = `
      query ByStates($stateNames: [String!]!) {
        issues(filter: { state: { name: { in: $stateNames } } }, first: 50) {
          nodes {
            id identifier title state { name }
          }
        }
      }
    `
    const data = await this.graphql<{ issues: { nodes: LinearIssueNode[] } }>(query, { stateNames })
    return (data?.issues?.nodes ?? []).map(normalizeIssue)
  }

  async fetchIssueStatesByIds(issueIds: string[]): Promise<Issue[]> {
    const query = `
      query ByIds($ids: [ID!]!) {
        issues(filter: { id: { in: $ids } }, first: 50) {
          nodes {
            id identifier title state { name }
          }
        }
      }
    `
    const data = await this.graphql<{ issues: { nodes: LinearIssueNode[] } }>(query, { ids: issueIds })
    return (data?.issues?.nodes ?? []).map(normalizeIssue)
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
    const response = await fetch(this.config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.config.apiKey,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      throw new Error(`Linear API returned ${response.status}`)
    }

    const body = (await response.json()) as GraphQLResponse<T>
    if (body.errors) {
      throw new Error(`Linear GraphQL errors: ${body.errors.map((e) => e.message).join(', ')}`)
    }

    return body.data ?? null
  }
}
```

- [ ] **Step 2: Write test for the linear tracker**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { LinearTracker } from '../src/tracker/linear'

const mockFetch = vi.fn()

describe('LinearTracker', () => {
  const config = {
    endpoint: 'https://api.linear.app/graphql',
    apiKey: 'test-key',
    projectSlug: 'my-project',
    activeStates: ['Todo', 'In Progress'],
    terminalStates: ['Done'],
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    mockFetch.mockReset()
  })

  it('fetches and normalizes candidate issues', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          issues: {
            nodes: [
              {
                id: 'abc-123',
                identifier: 'MT-649',
                title: 'Fix login',
                state: { name: 'In Progress' },
                priority: 1,
                labels: { nodes: [{ name: 'Bug' }] },
                children: { nodes: [] },
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-02T00:00:00Z',
              },
            ],
          },
        },
      }),
    })

    const tracker = new LinearTracker(config)
    const issues = await tracker.fetchCandidateIssues()
    expect(issues).toHaveLength(1)
    expect(issues[0].identifier).toBe('MT-649')
    expect(issues[0].labels).toEqual(['bug'])
    expect(issues[0].createdAt?.toISOString()).toBe('2025-01-01T00:00:00.000Z')
  })

  it('throws on GraphQL errors', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        errors: [{ message: 'Not authorized' }],
      }),
    })

    const tracker = new LinearTracker(config)
    await expect(tracker.fetchCandidateIssues()).rejects.toThrow('Not authorized')
  })
})
```

Run: `bun vitest run tests/tracker_linear.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/tracker/linear.ts tests/tracker_linear.test.ts
git commit -m "feat(opencode): add Linear GraphQL tracker client"
```

---

### Task 11: Workspace Manager

**Files:**
- Create: `src/workspace.ts`
- Create: `tests/workspace.test.ts`

- [ ] **Step 1: Write the workspace manager**

```typescript
import { mkdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { sanitizeWorkspaceKey, checkContainment } from './path_safety'
import { execHook, type HookResult } from './hooks'
import type { Workspace } from './models'

export interface WorkspaceManagerConfig {
  root: string
  afterCreate?: string | null
  beforeRun?: string | null
  afterRun?: string | null
  beforeRemove?: string | null
  hookTimeoutMs?: number
}

export class WorkspaceManager {
  private config: WorkspaceManagerConfig

  constructor(config: WorkspaceManagerConfig) {
    this.config = config
  }

  createForIssue(identifier: string): Workspace {
    const key = sanitizeWorkspaceKey(identifier)
    const wsPath = resolve(join(this.config.root, key))

    checkContainment(wsPath, this.config.root)

    const exists = existsSync(wsPath)
    if (!exists) {
      mkdirSync(wsPath, { recursive: true })
    }

    const ws: Workspace = { path: wsPath, workspaceKey: key, createdNow: !exists }

    if (ws.createdNow && this.config.afterCreate) {
      const result = execHook(this.config.afterCreate, wsPath, this.config.hookTimeoutMs ?? 60000)
      if (!result.success) {
        throw new Error(`after_create hook failed: ${result.error}`)
      }
    }

    return ws
  }

  async runBeforeRun(ws: Workspace): Promise<void> {
    if (this.config.beforeRun) {
      const result = execHook(this.config.beforeRun, ws.path, this.config.hookTimeoutMs ?? 60000)
      if (!result.success) {
        throw new Error(`before_run hook failed: ${result.error}`)
      }
    }
  }

  async runAfterRun(ws: Workspace): Promise<void> {
    if (this.config.afterRun) {
      try {
        await execHook(this.config.afterRun, ws.path, this.config.hookTimeoutMs ?? 60000)
      } catch {
        // failure is logged but ignored
      }
    }
  }

  removeForIssue(identifier: string): void {
    const key = sanitizeWorkspaceKey(identifier)
    const wsPath = resolve(join(this.config.root, key))

    if (!existsSync(wsPath)) return

    if (this.config.beforeRemove) {
      try {
        execHook(this.config.beforeRemove, wsPath, this.config.hookTimeoutMs ?? 60000)
      } catch {
        // failure is logged but ignored
      }
    }
  }
}
```

- [ ] **Step 2: Write test**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { WorkspaceManager } from '../src/workspace'

let testRoot: string

beforeEach(() => {
  testRoot = join(tmpdir(), `symphony-ws-test-${Date.now()}`)
  mkdirSync(testRoot, { recursive: true })
})

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true })
})

describe('WorkspaceManager', () => {
  it('creates workspace for an issue', () => {
    const wm = new WorkspaceManager({ root: testRoot })
    const ws = wm.createForIssue('ABC-123')
    expect(ws.workspaceKey).toBe('ABC-123')
    expect(ws.path).toContain('ABC-123')
    expect(existsSync(ws.path)).toBe(true)
    expect(ws.createdNow).toBe(true)
  })

  it('reuses existing workspace', () => {
    const wm = new WorkspaceManager({ root: testRoot })
    const ws1 = wm.createForIssue('ABC-123')
    const ws2 = wm.createForIssue('ABC-123')
    expect(ws1.path).toBe(ws2.path)
    expect(ws1.createdNow).toBe(true)
    expect(ws2.createdNow).toBe(false)
  })

  it('sanitizes workspace key', () => {
    const wm = new WorkspaceManager({ root: testRoot })
    const ws = wm.createForIssue('MT-649: fix bug')
    expect(ws.workspaceKey).toBe('MT-649_fix_bug')
  })

  it('rejects path outside root', () => {
    const wm = new WorkspaceManager({ root: testRoot })
    // Override the root to force violation
    const badManager = new WorkspaceManager({ root: join(testRoot, 'subdir') })
    expect(() => badManager.createForIssue('../../../etc')).toThrow()
  })
})
```

Run: `bun vitest run tests/workspace.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/workspace.ts tests/workspace.test.ts
git commit -m "feat(opencode): add workspace manager"
```

---

### Task 12: OpenCode Agent Runner

**Files:**
- Create: `src/openode_client.ts`
- Create: `src/agent_runner.ts`
- Create: `tests/agent_runner.test.ts`

- [ ] **Step 1: Write the OpenCode client interface and implementation**

```typescript
// src/opencode_client.ts
export interface SessionStatus {
  id: string
  status: string // "active" | "completed" | "failed" | etc.
  title?: string
}

export interface OpenCodeClient {
  createSession(title: string): Promise<string>
  sendMessage(sessionId: string, prompt: string): Promise<void>
  getSessionStatus(sessionId: string): Promise<SessionStatus>
  deleteSession(sessionId: string): Promise<void>
}

export class HttpOpenCodeClient implements OpenCodeClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async createSession(title: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    if (!res.ok) throw new Error(`Failed to create session: ${res.status}`)
    const data = await res.json() as { id: string }
    return data.id
  }

  async sendMessage(sessionId: string, prompt: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/session/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parts: [{ type: 'text', text: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`Failed to send message: ${res.status}`)
  }

  async getSessionStatus(sessionId: string): Promise<SessionStatus> {
    const res = await fetch(`${this.baseUrl}/session/${sessionId}`)
    if (!res.ok) throw new Error(`Failed to get session: ${res.status}`)
    return await res.json() as SessionStatus
  }

  async deleteSession(sessionId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/session/${sessionId}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Failed to delete session: ${res.status}`)
  }
}
```

- [ ] **Step 2: Write agent runner using OpenCodeClient**

```typescript
// src/agent_runner.ts
import type { Issue } from './models'
import type { OpenCodeClient } from './opencode_client'
import { getLogger } from './log'

export interface AgentRunResult {
  sessionId: string | null
  success: boolean
  error?: string
}

export class AgentRunner {
  private client: OpenCodeClient

  constructor(client: OpenCodeClient) {
    this.client = client
  }

  async run(issue: Issue, prompt: string): Promise<AgentRunResult> {
    const log = getLogger()

    try {
      const sessionId = await this.client.createSession(`${issue.identifier}: ${issue.title}`)
      log.info({ issueId: issue.id, sessionId }, 'session_created')

      await this.client.sendMessage(sessionId, prompt)
      log.info({ issueId: issue.id, sessionId }, 'prompt_sent')

      // Poll for completion
      const status = await this.pollForCompletion(sessionId)
      
      return {
        sessionId,
        success: status.status === 'completed' || status.status === 'idle',
        error: status.status === 'failed' ? 'Session failed' : undefined,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error({ issueId: issue.id, error: message }, 'agent_run_failed')
      return { sessionId: null, success: false, error: message }
    }
  }

  private async pollForCompletion(sessionId: string): Promise<SessionStatus> {
    const maxAttempts = 60
    const pollIntervalMs = 5000

    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.client.getSessionStatus(sessionId)
      if (status.status !== 'active') {
        return status
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }

    throw new Error('Session did not complete within poll limit')
  }
}

// Re-export for external use
export type { SessionStatus } from './opencode_client'
```

- [ ] **Step 3: Write test**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { AgentRunner } from '../src/agent_runner'
import type { OpenCodeClient, SessionStatus } from '../src/opencode_client'
import type { Issue } from '../src/models'

describe('AgentRunner', () => {
  it('creates session and sends prompt', async () => {
    const client: OpenCodeClient = {
      createSession: vi.fn().mockResolvedValue('session-1'),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      getSessionStatus: vi.fn()
        .mockResolvedValueOnce({ id: 'session-1', status: 'active' })
        .mockResolvedValueOnce({ id: 'session-1', status: 'completed' }),
      deleteSession: vi.fn(),
    }

    const runner = new AgentRunner(client)
    const issue = { id: 'abc', identifier: 'MT-1', title: 'Test', state: 'Todo' } as Issue
    const result = await runner.run(issue, 'Work on this issue')

    expect(result.success).toBe(true)
    expect(result.sessionId).toBe('session-1')
    expect(client.createSession).toHaveBeenCalledWith('MT-1: Test')
    expect(client.sendMessage).toHaveBeenCalledWith('session-1', 'Work on this issue')
  })

  it('handles session failure', async () => {
    const client: OpenCodeClient = {
      createSession: vi.fn().mockResolvedValue('session-2'),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      getSessionStatus: vi.fn()
        .mockResolvedValueOnce({ id: 'session-2', status: 'active' })
        .mockResolvedValueOnce({ id: 'session-2', status: 'failed' }),
      deleteSession: vi.fn(),
    }

    const runner = new AgentRunner(client)
    const issue = { id: 'abc', identifier: 'MT-1', title: 'Test', state: 'Todo' } as Issue
    const result = await runner.run(issue, 'Work on this issue')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Session failed')
  })

  it('handles client errors', async () => {
    const client: OpenCodeClient = {
      createSession: vi.fn().mockRejectedValue(new Error('Connection refused')),
      sendMessage: vi.fn(),
      getSessionStatus: vi.fn(),
      deleteSession: vi.fn(),
    }

    const runner = new AgentRunner(client)
    const issue = { id: 'abc', identifier: 'MT-1', title: 'Test', state: 'Todo' } as Issue
    const result = await runner.run(issue, 'Work on this issue')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Connection refused')
  })
})
```

Run: `bun vitest run tests/agent_runner.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/opencode_client.ts src/agent_runner.ts tests/agent_runner.test.ts
git commit -m "feat(opencode): add OpenCode HTTP client and agent runner"
```

---

### Task 13: Status Snapshot Builder

**Files:**
- Create: `src/status.ts`
- Create: `tests/status.test.ts`

- [ ] **Step 1: Write status builder**

```typescript
import type { OrchestratorState } from './models'
import { getLogger } from './log'

export interface RuntimeSnapshot {
  generatedAt: string
  counts: {
    running: number
    retrying: number
  }
  running: Array<{
    issueId: string
    issueIdentifier: string
    state: string
    sessionId: string | null
    turnCount: number
    startedAt: string | null
  }>
  retrying: Array<{
    issueId: string
    identifier: string
    attempt: number
    error: string | null
  }>
  codexTotals: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    secondsRunning: number
  }
}

export function buildSnapshot(state: OrchestratorState): RuntimeSnapshot {
  const running = Array.from(state.running.values()).map((entry) => ({
    issueId: entry.issueId,
    issueIdentifier: entry.identifier,
    state: entry.issue.state,
    sessionId: entry.sessionId,
    turnCount: entry.retryAttempt,
    startedAt: entry.startedAt?.toISOString() ?? null,
  }))

  const retrying = Array.from(state.retryAttempts.values()).map((entry) => ({
    issueId: entry.issueId,
    identifier: entry.identifier,
    attempt: entry.attempt,
    error: entry.error,
  }))

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      running: running.length,
      retrying: retrying.length,
    },
    running,
    retrying,
    codexTotals: { ...state.codexTotals },
  }
}

export function logSnapshot(state: OrchestratorState): void {
  const snapshot = buildSnapshot(state)
  const log = getLogger()
  log.info({ snapshot }, 'runtime_snapshot')
}
```

- [ ] **Step 2: Write test**

```typescript
import { describe, it, expect } from 'vitest'
import { buildSnapshot } from '../src/status'
import { createOrchestratorState } from '../src/models'

describe('buildSnapshot', () => {
  it('produces empty snapshot for default state', () => {
    const state = createOrchestratorState()
    const snap = buildSnapshot(state)
    expect(snap.counts.running).toBe(0)
    expect(snap.counts.retrying).toBe(0)
    expect(snap.codexTotals.inputTokens).toBe(0)
    expect(snap.generatedAt).toBeTruthy()
  })
})
```

Run: `bun vitest run tests/status.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/status.ts tests/status.test.ts
git commit -m "feat(opencode): add status snapshot builder"
```

---

### Task 14: Orchestrator

**Files:**
- Create: `src/orchestrator.ts`
- Create: `tests/orchestrator.test.ts`

- [ ] **Step 1: Write orchestrator**

```typescript
import type { OrchestratorState, Issue, RunningEntry, RetryEntry } from './models'
import { createOrchestratorState } from './models'
import { getLogger } from './log'
import type { TrackerAdapter } from './tracker/base'
import type { AgentRunner, AgentRunResult } from './agent_runner'
import type { WorkspaceManager } from './workspace'

export function dispatchKey(issue: Issue): [number, number, string] {
  const prio = issue.priority ?? 9999
  const created = issue.createdAt?.getTime() ?? 0
  return [prio, created, issue.identifier]
}

export function shouldDispatch(
  issue: Issue,
  state: OrchestratorState,
  activeStates: string[] = ['Todo', 'In Progress'],
  terminalStates: string[] = ['Closed', 'Cancelled', 'Canceled', 'Duplicate', 'Done'],
): boolean {
  if (state.running.has(issue.id)) return false
  if (state.claimed.has(issue.id)) return false
  if (!activeStates.includes(issue.state)) return false
  if (terminalStates.includes(issue.state)) return false

  if (issue.state.toLowerCase() === 'todo') {
    for (const blocker of issue.blockedBy ?? []) {
      if (blocker.state && !terminalStates.includes(blocker.state)) {
        return false
      }
    }
  }

  return true
}

export function availableSlots(state: OrchestratorState): number {
  return Math.max(state.maxConcurrentAgents - state.running.size, 0)
}

export function availableSlotsForState(state: OrchestratorState, issueState: string): number {
  const key = issueState.toLowerCase()
  const perStateLimit = state.maxConcurrentAgentsByState[key]
  if (perStateLimit !== undefined) {
    const runningInState = Array.from(state.running.values()).filter(
      (e) => e.issue.state.toLowerCase() === key,
    ).length
    return Math.max(perStateLimit - runningInState, 0)
  }
  return availableSlots(state)
}

export function backoffDelay(attempt: number, maxBackoffMs: number = 300000): number {
  if (attempt <= 0) attempt = 1
  const delay = 10000 * Math.pow(2, attempt - 1)
  return Math.min(delay, maxBackoffMs)
}

export interface OrchestratorConfig {
  tracker: TrackerAdapter
  agentRunner: AgentRunner
  workspaceManager?: WorkspaceManager
  maxConcurrent?: number
  pollIntervalMs?: number
  activeStates?: string[]
  terminalStates?: string[]
  maxTurns?: number
  maxRetryBackoffMs?: number
  stallTimeoutMs?: number
  maxConcurrentByState?: Record<string, number>
}

export class SymphonyOrchestrator {
  state: OrchestratorState
  private tracker: TrackerAdapter
  private agentRunner: AgentRunner
  private workspaceManager?: WorkspaceManager
  private activeStates: string[]
  private terminalStates: string[]
  private maxTurns: number
  private maxRetryBackoffMs: number
  private stallTimeoutMs: number
  private tickInterval: number
  private running = true
  private observers: Array<(state: OrchestratorState) => void> = []

  constructor(config: OrchestratorConfig) {
    this.state = createOrchestratorState({
      maxConcurrentAgents: config.maxConcurrent ?? 10,
      pollIntervalMs: config.pollIntervalMs ?? 30000,
      maxConcurrentAgentsByState: config.maxConcurrentByState ?? {},
    })
    this.tracker = config.tracker
    this.agentRunner = config.agentRunner
    this.workspaceManager = config.workspaceManager
    this.activeStates = config.activeStates ?? ['Todo', 'In Progress']
    this.terminalStates = config.terminalStates ?? ['Closed', 'Cancelled', 'Canceled', 'Duplicate', 'Done']
    this.maxTurns = config.maxTurns ?? 20
    this.maxRetryBackoffMs = config.maxRetryBackoffMs ?? 300000
    this.stallTimeoutMs = config.stallTimeoutMs ?? 300000
    this.tickInterval = (config.pollIntervalMs ?? 30000) / 1000
  }

  async run(): Promise<void> {
    const log = getLogger()
    log.info('orchestrator_started')
    await this.startupCleanup()
    await this.tick()
    while (this.running) {
      await new Promise((resolve) => setTimeout(resolve, this.tickInterval * 1000))
      if (!this.running) break
      await this.tick()
    }
    log.info('orchestrator_stopped')
  }

  stop(): void {
    this.running = false
  }

  private async tick(): Promise<void> {
    this.state = await this.reconcileRunning()
    // Dispatch
    let issues: Issue[] = []
    try {
      issues = await this.tracker.fetchCandidateIssues()
    } catch (err) {
      getLogger().error({ error: String(err) }, 'candidate_fetch_failed')
      this.notifyObservers()
      return
    }

    for (const issue of issues.sort((a, b) => {
      const [pa, ca, ia] = dispatchKey(a)
      const [pb, cb, ib] = dispatchKey(b)
      if (pa !== pb) return pa - pb
      if (ca !== cb) return ca - cb
      return ia.localeCompare(ib)
    })) {
      if (availableSlots(this.state) <= 0) break
      if (availableSlotsForState(this.state, issue.state) <= 0) continue
      if (shouldDispatch(issue, this.state, this.activeStates, this.terminalStates)) {
        this.dispatchIssue(issue)
      }
    }

    this.notifyObservers()
  }

  private async reconcileRunning(): Promise<OrchestratorState> {
    this.state = this.reconcileStalledRuns()

    return this.state
  }

  private reconcileStalledRuns(): OrchestratorState {
    if (this.stallTimeoutMs <= 0) return this.state
    const now = new Date()
    const toRemove: string[] = []

    for (const [issueId, entry] of this.state.running) {
      const reference = entry.lastCodexTimestamp ?? entry.startedAt
      if (!reference) continue
      const elapsed = now.getTime() - reference.getTime()
      if (elapsed > this.stallTimeoutMs) {
        getLogger().warn({ issueId, identifier: entry.identifier, elapsedMs: elapsed }, 'stall_detected')
        if (entry.cancel) entry.cancel()
        toRemove.push(issueId)
      }
    }

    for (const issueId of toRemove) {
      this.state = this.terminateRunningIssue(issueId, false)
      this.state.retryAttempts.set(issueId, {
        issueId,
        identifier: 'unknown',
        attempt: 1,
        dueAtMs: Date.now() + 1000,
        error: 'stall_timeout',
      })
      this.state.claimed.add(issueId)
    }

    return this.state
  }

  private terminateRunningIssue(issueId: string, cleanupWorkspace: boolean): OrchestratorState {
    const entry = this.state.running.get(issueId)
    this.state.running.delete(issueId)
    this.state.claimed.delete(issueId)
    if (entry) {
      if (entry.startedAt) {
        const elapsed = (Date.now() - entry.startedAt.getTime()) / 1000
        this.state.codexTotals.secondsRunning += elapsed
      }
      this.state.codexTotals.totalTokens += entry.codexTotalTokens
      this.state.codexTotals.inputTokens += entry.codexInputTokens
      this.state.codexTotals.outputTokens += entry.codexOutputTokens
    }
    return this.state
  }

  private async startupCleanup(): Promise<void> {
    try {
      const terminalIssues = await this.tracker.fetchIssuesByStates(this.terminalStates)
      for (const ti of terminalIssues) {
        this.workspaceManager?.removeForIssue(ti.identifier)
      }
    } catch (err) {
      getLogger().warn({ error: String(err) }, 'startup_cleanup_failed')
    }
  }

  private dispatchIssue(issue: Issue, attempt?: number | null): void {
    const wrapper = async () => {
      try {
        let ws = this.workspaceManager?.createForIssue(issue.identifier)
        if (ws && this.workspaceManager) {
          await this.workspaceManager.runBeforeRun(ws)
        }
        const result = await this.agentRunner.run(issue, `Work on ${issue.identifier}: ${issue.title}`)
        this.onWorkerExit(issue.id, result.success)
      } catch (err) {
        getLogger().error({ issueId: issue.id, error: String(err) }, 'worker_failed')
        this.onWorkerExit(issue.id, false)
      }
    }

    const abortController = new AbortController()
    const task = wrapper()

    this.state.running.set(issue.id, {
      issueId: issue.id,
      identifier: issue.identifier,
      issue,
      sessionId: null,
      lastCodexEvent: null,
      lastCodexTimestamp: null,
      lastCodexMessage: '',
      codexInputTokens: 0,
      codexOutputTokens: 0,
      codexTotalTokens: 0,
      lastReportedInputTokens: 0,
      lastReportedOutputTokens: 0,
      lastReportedTotalTokens: 0,
      retryAttempt: attempt ?? 0,
      startedAt: new Date(),
      task,
      cancel: () => abortController.abort(),
    })

    this.state.claimed.add(issue.id)
    this.state.retryAttempts.delete(issue.id)
    getLogger().info({ issueId: issue.id, identifier: issue.identifier, state: issue.state }, 'dispatched')
  }

  private onWorkerExit(issueId: string, normal: boolean): void {
    const entry = this.state.running.get(issueId)
    if (!entry) return

    this.state.running.delete(issueId)
    this.state.claimed.delete(issueId)

    if (entry.startedAt) {
      const elapsed = (Date.now() - entry.startedAt.getTime()) / 1000
      this.state.codexTotals.secondsRunning += elapsed
    }
    this.state.codexTotals.totalTokens += entry.codexTotalTokens
    this.state.codexTotals.inputTokens += entry.codexInputTokens
    this.state.codexTotals.outputTokens += entry.codexOutputTokens

    if (normal) {
      this.state.completed.add(issueId)
      this.state.retryAttempts.set(issueId, {
        issueId,
        identifier: entry.identifier,
        attempt: 1,
        dueAtMs: Date.now() + 1000,
        error: null,
      })
      this.state.claimed.add(issueId)
    } else {
      const nextAttempt = entry.retryAttempt + 1
      const delay = backoffDelay(nextAttempt, this.maxRetryBackoffMs)
      this.state.retryAttempts.set(issueId, {
        issueId,
        identifier: entry.identifier,
        attempt: nextAttempt,
        dueAtMs: Date.now() + delay,
        error: 'worker_exit_abnormal',
      })
      this.state.claimed.add(issueId)
    }

    this.notifyObservers()
  }

  addObserver(callback: (state: OrchestratorState) => void): void {
    this.observers.push(callback)
  }

  private notifyObservers(): void {
    for (const cb of this.observers) {
      try {
        cb(this.state)
      } catch (err) {
        getLogger().warn({ error: String(err) }, 'observer_error')
      }
    }
  }
}
```

- [ ] **Step 2: Write test**

```typescript
import { describe, it, expect } from 'vitest'
import { shouldDispatch, dispatchKey, availableSlots, backoffDelay } from '../src/orchestrator'
import { createOrchestratorState } from '../src/models'
import type { Issue } from '../src/models'

describe('dispatchKey', () => {
  it('sorts by priority ascending', () => {
    const a = { identifier: 'A-1', priority: 1, createdAt: null } as Issue
    const b = { identifier: 'B-1', priority: 2, createdAt: null } as Issue
    expect(dispatchKey(a) < dispatchKey(b)).toBe(true)
  })

  it('sorts null priority last', () => {
    const a = { identifier: 'A-1', priority: null, createdAt: null } as Issue
    const b = { identifier: 'B-1', priority: 1, createdAt: null } as Issue
    expect(dispatchKey(a) > dispatchKey(b)).toBe(true)
  })
})

describe('shouldDispatch', () => {
  it('allows eligible issue', () => {
    const issue = { id: '1', identifier: 'A-1', title: 't', state: 'Todo', blockedBy: [] } as Issue
    const state = createOrchestratorState()
    expect(shouldDispatch(issue, state)).toBe(true)
  })

  it('rejects already running issue', () => {
    const issue = { id: '1', identifier: 'A-1', title: 't', state: 'Todo' } as Issue
    const state = createOrchestratorState()
    state.running.set('1', {} as any)
    expect(shouldDispatch(issue, state)).toBe(false)
  })

  it('rejects claimed issue', () => {
    const issue = { id: '1', identifier: 'A-1', title: 't', state: 'Todo' } as Issue
    const state = createOrchestratorState()
    state.claimed.add('1')
    expect(shouldDispatch(issue, state)).toBe(false)
  })

  it('rejects todo issue with active blockers', () => {
    const issue = {
      id: '1', identifier: 'A-1', title: 't', state: 'Todo',
      blockedBy: [{ id: 'b1', identifier: 'B-1', state: 'In Progress' }],
    } as Issue
    const state = createOrchestratorState()
    expect(shouldDispatch(issue, state)).toBe(false)
  })
})

describe('availableSlots', () => {
  it('returns max when no running', () => {
    const state = createOrchestratorState({ maxConcurrentAgents: 10 })
    expect(availableSlots(state)).toBe(10)
  })
})

describe('backoffDelay', () => {
  it('caps at maxBackoffMs', () => {
    expect(backoffDelay(10, 300000)).toBe(300000)
  })

  it('computes exponential delay', () => {
    expect(backoffDelay(1)).toBe(10000)
    expect(backoffDelay(2)).toBe(20000)
    expect(backoffDelay(3)).toBe(40000)
  })
})
```

Run: `bun vitest run tests/orchestrator.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/orchestrator.ts tests/orchestrator.test.ts
git commit -m "feat(opencode): add orchestrator state machine"
```

---

### Task 15: CLI Entry Point

**Files:**
- Create: `src/main.ts`

- [ ] **Step 1: Write main.ts**

```typescript
import { WorkflowStore } from './workflow_store'
import { validateDispatchConfig } from './config'
import { configureLogging, getLogger } from './log'
import { SymphonyOrchestrator } from './orchestrator'
import { AgentRunner } from './agent_runner'
import { HttpOpenCodeClient } from './opencode_client'
import { WorkspaceManager } from './workspace'
import { LinearTracker } from './tracker/linear'
import { MemoryTracker } from './tracker/memory'
import { logSnapshot } from './status'
import { existsSync } from 'node:fs'

interface CliArgs {
  workflowPath: string | null
  port?: number
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { workflowPath: null }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--port') {
      args.port = parseInt(argv[++i], 10)
    } else if (!args.workflowPath) {
      args.workflowPath = argv[i]
    }
  }
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv)
  const logLevel = process.env.SYMPHONY_LOG_LEVEL || 'info'
  configureLogging({ level: logLevel })
  const log = getLogger()

  log.info('symphony_starting')

  // Load workflow with file watching
  const store = new WorkflowStore(args.workflowPath)
  if (store.workflow === null) {
    log.error({ error: store.lastError }, 'workflow_load_failed')
    process.exit(1)
  }
  const config = store.config!

  // Validate
  const errors = validateDispatchConfig(config)
  if (errors.length > 0) {
    for (const err of errors) {
      log.error({ error: err }, 'config_validation_failed')
    }
    process.exit(1)
  }

  log.info({ trackerKind: config.tracker.kind, projectSlug: config.tracker.projectSlug }, 'symphony_config_loaded')

  // Initialize tracker
  const tracker = new LinearTracker({
    endpoint: config.tracker.endpoint,
    apiKey: config.tracker.apiKey,
    projectSlug: config.tracker.projectSlug,
    activeStates: config.tracker.activeStates,
    terminalStates: config.tracker.terminalStates,
  })

  // Initialize workspace manager
  const wsManager = new WorkspaceManager({
    root: config.workspace.root,
    afterCreate: config.hooks.afterCreate,
    beforeRun: config.hooks.beforeRun,
    afterRun: config.hooks.afterRun,
    beforeRemove: config.hooks.beforeRemove,
    hookTimeoutMs: config.hooks.timeoutMs,
  })

  // Connect to OpenCode server
  const opencodeClient = new HttpOpenCodeClient(config.opencode.serverUrl)

  // Launch server if configured
  if (config.opencode.serverStartCommand) {
    log.info({ command: config.opencode.serverStartCommand }, 'launching_opencode_server')
    const { execSync } = await import('node:child_process')
    execSync(config.opencode.serverStartCommand, { stdio: 'inherit', shell: true, cwd: process.cwd() })
  }

  // Health check
  try {
    const health = await fetch(`${config.opencode.serverUrl}/global/health`)
    if (!health.ok) throw new Error(`Health check returned ${health.status}`)
    log.info({ serverUrl: config.opencode.serverUrl }, 'opencode_server_connected')
  } catch (err) {
    log.error({ error: String(err) }, 'opencode_server_unreachable')
    process.exit(1)
  }

  const agentRunner = new AgentRunner(opencodeClient)

  // Build orchestrator
  const orch = new SymphonyOrchestrator({
    tracker,
    agentRunner,
    workspaceManager: wsManager,
    maxConcurrent: config.agent.maxConcurrentAgents,
    pollIntervalMs: config.polling.intervalMs,
    activeStates: config.tracker.activeStates,
    terminalStates: config.tracker.terminalStates,
    maxTurns: config.agent.maxTurns,
    maxRetryBackoffMs: config.agent.maxRetryBackoffMs,
    stallTimeoutMs: config.opencode.stallTimeoutMs,
    maxConcurrentByState: config.agent.maxConcurrentAgentsByState,
  })

  // Log state changes
  orch.addObserver((state) => {
    logSnapshot(state)
  })

  // Handle shutdown
  const shutdown = () => {
    log.info('shutdown_requested')
    orch.stop()
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  log.info('symphony_started')
  await orch.run()
  log.info('symphony_stopped')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Commit**

```bash
git add src/main.ts
git commit -m "feat(opencode): add CLI entry point"
```

---

### Task 16: OpenCode linear_graphql Plugin

**Files:**
- Create: `.opencode/package.json`
- Create: `.opencode/plugins/linear_graphql.ts`

- [ ] **Step 1: Create .opencode/package.json**

```json
{
  "dependencies": {
    "@opencode-ai/plugin": "1.14.39"
  }
}
```

- [ ] **Step 2: Write the plugin**

```typescript
// .opencode/plugins/linear_graphql.ts
import { type Plugin, tool } from "@opencode-ai/plugin"

export const LinearGraphQLPlugin: Plugin = async () => {
  return {
    tool: {
      linear_graphql: tool({
        description: "Execute a raw GraphQL query or mutation against Linear using configured auth",
        args: {
          query: tool.schema.string().describe("Single GraphQL query or mutation document"),
          variables: tool.schema.string().optional().describe("JSON object of GraphQL variables"),
        },
        async execute(args) {
          const apiKey = process.env.LINEAR_API_KEY
          if (!apiKey) {
            return JSON.stringify({ success: false, error: "LINEAR_API_KEY not set" })
          }

          // Validate query is non-empty and contains exactly one operation
          if (!args.query || args.query.trim().length === 0) {
            return JSON.stringify({ success: false, error: "query must be a non-empty string" })
          }

          const operationCount = (args.query.match(/\b(query|mutation)\s+\w+/g) || []).length
          if (operationCount !== 1) {
            return JSON.stringify({ success: false, error: "query must contain exactly one operation" })
          }

          let variables: Record<string, unknown> | undefined
          if (args.variables) {
            try {
              variables = JSON.parse(args.variables)
            } catch {
              return JSON.stringify({ success: false, error: "variables must be a valid JSON object" })
            }
          }

          try {
            const response = await fetch("https://api.linear.app/graphql", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: apiKey,
              },
              body: JSON.stringify({ query: args.query, variables }),
            })

            const body = await response.json()

            if (body.errors) {
              return JSON.stringify({ success: false, data: body })
            }

            return JSON.stringify({ success: true, data: body.data })
          } catch (err) {
            return JSON.stringify({ success: false, error: String(err) })
          }
        },
      }),
    },
  }
}
```

- [ ] **Step 3: Install plugin dependencies**

Run: `cd .opencode && bun install`
Expected: `node_modules/` created with `@opencode-ai/plugin`

- [ ] **Step 4: Commit**

```bash
git add .opencode/package.json .opencode/plugins/linear_graphql.ts
git commit -m "feat(opencode): add linear_graphql OpenCode plugin"
```

---

### Task 17: Verification

- [ ] **Step 1: Typecheck**

Run: `bun tsc --noEmit`
Expected: No type errors

- [ ] **Step 2: Run all tests**

Run: `bun vitest run`
Expected: All tests PASS

- [ ] **Step 3: Final commit with any test fixes**

```bash
git add -A
git commit -m "chore: finalize OpenCode port with passing tests"
```
