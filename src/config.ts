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
  const env = envOverrides ?? (process.env as Record<string, string | undefined>)
  const raw = wf.config

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

  const pollRaw = (raw.polling as Record<string, unknown>) ?? {}
  const intervalMs = (pollRaw.interval_ms as number) ?? 30000

  const wsRaw = (raw.workspace as Record<string, unknown>) ?? {}
  const wsRoot = wsRaw.root
    ? expandPath(String(wsRaw.root), workflowDir)
    : join(tmpdir(), 'symphony_workspaces')

  const hRaw = (raw.hooks as Record<string, unknown>) ?? {}
  const hooks: HooksConfig = {
    afterCreate: (hRaw.after_create as string) ?? null,
    beforeRun: (hRaw.before_run as string) ?? null,
    afterRun: (hRaw.after_run as string) ?? null,
    beforeRemove: (hRaw.before_remove as string) ?? null,
    timeoutMs: (hRaw.timeout_ms as number) ?? 60000,
  }

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

  const oRaw = (raw.opencode as Record<string, unknown>) ?? {}
  const opencode: OpenCodeConfig = {
    serverUrl: (oRaw.server_url as string) ?? 'http://localhost:4096',
    serverStartCommand: (oRaw.server_start_command as string) ?? null,
    stallTimeoutMs: (oRaw.stall_timeout_ms as number) ?? 300000,
    sessionTimeoutMs: (oRaw.session_timeout_ms as number) ?? 3600000,
  }

  return {
    tracker: { kind, endpoint, apiKey, projectSlug, activeStates: [...activeStates], terminalStates: [...terminalStates] },
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
