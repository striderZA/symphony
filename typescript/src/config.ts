import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'
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

const TrackerRawSchema = z.object({
  kind: z.string().default(''),
  endpoint: z.string().default(''),
  api_key: z.string().default(''),
  project_slug: z.string().default(''),
  active_states: z.array(z.string()).default(['Todo', 'In Progress']),
  terminal_states: z.array(z.string()).default(['Closed', 'Cancelled', 'Canceled', 'Duplicate', 'Done']),
})

const PollingRawSchema = z.object({
  interval_ms: z.number().int().positive().default(30000),
})

const WorkspaceRawSchema = z.object({
  root: z.string().optional(),
})

const HooksRawSchema = z.object({
  after_create: z.string().nullable().optional(),
  before_run: z.string().nullable().optional(),
  after_run: z.string().nullable().optional(),
  before_remove: z.string().nullable().optional(),
  timeout_ms: z.number().int().positive().default(60000),
})

const AgentRawSchema = z.object({
  max_concurrent_agents: z.number().int().positive().default(10),
  max_turns: z.number().int().positive().default(20),
  max_retry_backoff_ms: z.number().int().positive().default(300000),
  max_concurrent_agents_by_state: z.record(z.number().positive()).default({}),
})

const OpenCodeRawSchema = z.object({
  server_url: z.string().default('http://localhost:4096'),
  server_start_command: z.string().nullable().default(null),
  stall_timeout_ms: z.number().int().positive().default(300000),
  session_timeout_ms: z.number().int().positive().default(3600000),
})

const CodexRawSchema = z.object({
  command: z.string().default('codex app-server'),
  approval_policy: z.string().default('never'),
  thread_sandbox: z.string().default('workspace-write'),
  turn_sandbox_policy: z.record(z.unknown()).default({}),
  turn_timeout_ms: z.number().int().positive().default(3600000),
  read_timeout_ms: z.number().int().positive().default(5000),
  stall_timeout_ms: z.number().int().default(300000),
})

const ServerRawSchema = z.object({
  port: z.number().int().nullable().default(null),
  host: z.string().default('127.0.0.1'),
})

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

export interface CodexConfig {
  command: string
  approvalPolicy: string
  threadSandbox: string
  turnSandboxPolicy: Record<string, unknown>
  turnTimeoutMs: number
  readTimeoutMs: number
  stallTimeoutMs: number
}

export interface ServerConfig {
  port: number | null
  host: string
}

export interface ServiceConfig {
  tracker: TrackerConfig
  polling: PollingConfig
  workspace: WorkspaceConfig
  hooks: HooksConfig
  agent: AgentConfig
  opencode: OpenCodeConfig
  codex: CodexConfig
  server: ServerConfig
}

export function buildServiceConfig(wf: WorkflowDefinition, workflowDir?: string, envOverrides?: Record<string, string | undefined>): ServiceConfig {
  const env = envOverrides ?? (process.env as Record<string, string | undefined>)
  const raw = wf.config

  const trackerRaw = TrackerRawSchema.parse(raw.tracker ?? {})
  const pollRaw = PollingRawSchema.parse(raw.polling ?? {})
  const wsRaw = WorkspaceRawSchema.parse(raw.workspace ?? {})
  const hRaw = HooksRawSchema.parse(raw.hooks ?? {})
  const aRaw = AgentRawSchema.parse(raw.agent ?? {})
  const oRaw = OpenCodeRawSchema.parse(raw.opencode ?? {})
  const codexRaw = CodexRawSchema.parse(raw.codex ?? {})
  const serverRaw = ServerRawSchema.parse(raw.server ?? {})

  let endpoint = trackerRaw.endpoint
  if (!endpoint && trackerRaw.kind === 'linear') {
    endpoint = 'https://api.linear.app/graphql'
  }

  const apiKey = resolveVar(trackerRaw.api_key, env)

  const wsRoot = wsRaw.root
    ? expandPath(wsRaw.root, workflowDir)
    : join(tmpdir(), 'symphony_workspaces')

  const perState: Record<string, number> = {}
  const rawPerState = aRaw.max_concurrent_agents_by_state
  for (const [k, v] of Object.entries(rawPerState)) {
    if (typeof v === 'number' && v > 0) {
      perState[k.toLowerCase()] = v
    }
  }

  return {
    tracker: {
      kind: trackerRaw.kind,
      endpoint,
      apiKey,
      projectSlug: trackerRaw.project_slug,
      activeStates: [...trackerRaw.active_states],
      terminalStates: [...trackerRaw.terminal_states],
    },
    polling: { intervalMs: pollRaw.interval_ms },
    workspace: { root: wsRoot },
    hooks: {
      afterCreate: hRaw.after_create ?? null,
      beforeRun: hRaw.before_run ?? null,
      afterRun: hRaw.after_run ?? null,
      beforeRemove: hRaw.before_remove ?? null,
      timeoutMs: hRaw.timeout_ms,
    },
    agent: {
      maxConcurrentAgents: aRaw.max_concurrent_agents,
      maxTurns: aRaw.max_turns,
      maxRetryBackoffMs: aRaw.max_retry_backoff_ms,
      maxConcurrentAgentsByState: perState,
    },
    opencode: {
      serverUrl: oRaw.server_url,
      serverStartCommand: oRaw.server_start_command,
      stallTimeoutMs: oRaw.stall_timeout_ms,
      sessionTimeoutMs: oRaw.session_timeout_ms,
    },
    codex: {
      command: codexRaw.command,
      approvalPolicy: codexRaw.approval_policy,
      threadSandbox: codexRaw.thread_sandbox,
      turnSandboxPolicy: codexRaw.turn_sandbox_policy,
      turnTimeoutMs: codexRaw.turn_timeout_ms,
      readTimeoutMs: codexRaw.read_timeout_ms,
      stallTimeoutMs: codexRaw.stall_timeout_ms,
    },
    server: {
      port: serverRaw.port,
      host: serverRaw.host,
    },
  }
}

export function parseAndValidateConfig(wf: WorkflowDefinition, workflowDir?: string, envOverrides?: Record<string, string | undefined>): ServiceConfig {
  return buildServiceConfig(wf, workflowDir, envOverrides)
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
