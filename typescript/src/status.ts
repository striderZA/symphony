import type { OrchestratorState } from './models'
import { getLogger } from './log'

export interface RunningAgentSnapshot {
  issueId: string
  issueIdentifier: string
  state: string
  sessionId: string | null
  pid: string | null
  turnCount: number
  runtimeSeconds: number
  codexTotalTokens: number
  startedAt: string | null
  lastCodexEvent: string | null
  lastCodexMessage: string
}

export interface RuntimeSnapshot {
  generatedAt: string
  maxAgents: number
  rateLimits: unknown
  polling: { nextPollInMs: number } | null
  counts: { running: number; retrying: number }
  running: RunningAgentSnapshot[]
  retrying: Array<{
    issueId: string
    identifier: string
    attempt: number
    dueAtMs: number
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
    pid: entry.session?.codexAppServerPid ?? null,
    turnCount: entry.session?.turnCount ?? entry.retryAttempt,
    runtimeSeconds: entry.startedAt
      ? Math.floor((Date.now() - entry.startedAt.getTime()) / 1000)
      : 0,
    codexTotalTokens:
      entry.session?.codexTotalTokens ?? entry.codexTotalTokens,
    startedAt: entry.startedAt?.toISOString() ?? null,
    lastCodexEvent: entry.lastCodexEvent,
    lastCodexMessage: entry.lastCodexMessage,
  }))
  const retrying = Array.from(state.retryAttempts.values()).map((entry) => ({
    issueId: entry.issueId,
    identifier: entry.identifier,
    attempt: entry.attempt,
    dueAtMs: entry.dueAtMs,
    error: entry.error,
  }))
  return {
    generatedAt: new Date().toISOString(),
    maxAgents: state.maxConcurrentAgents,
    rateLimits: state.codexRateLimits,
    polling: { nextPollInMs: state.pollIntervalMs },
    counts: { running: running.length, retrying: retrying.length },
    running,
    retrying,
    codexTotals: { ...state.codexTotals },
  }
}

export function logSnapshot(state: OrchestratorState): void {
  const snapshot = buildSnapshot(state)
  getLogger().info({ snapshot }, 'runtime_snapshot')
}
