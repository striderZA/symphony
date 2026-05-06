import type { OrchestratorState } from './models'
import { getLogger } from './log'

export interface RuntimeSnapshot {
  generatedAt: string
  counts: { running: number; retrying: number }
  running: Array<{ issueId: string; issueIdentifier: string; state: string; sessionId: string | null; turnCount: number; startedAt: string | null }>
  retrying: Array<{ issueId: string; identifier: string; attempt: number; error: string | null }>
  codexTotals: { inputTokens: number; outputTokens: number; totalTokens: number; secondsRunning: number }
}

export function buildSnapshot(state: OrchestratorState): RuntimeSnapshot {
  const running = Array.from(state.running.values()).map((entry) => ({
    issueId: entry.issueId, issueIdentifier: entry.identifier, state: entry.issue.state,
    sessionId: entry.sessionId, turnCount: entry.retryAttempt, startedAt: entry.startedAt?.toISOString() ?? null,
  }))
  const retrying = Array.from(state.retryAttempts.values()).map((entry) => ({
    issueId: entry.issueId, identifier: entry.identifier, attempt: entry.attempt, error: entry.error,
  }))
  return {
    generatedAt: new Date().toISOString(),
    counts: { running: running.length, retrying: retrying.length },
    running, retrying, codexTotals: { ...state.codexTotals },
  }
}

export function logSnapshot(state: OrchestratorState): void {
  const snapshot = buildSnapshot(state)
  getLogger().info({ snapshot }, 'runtime_snapshot')
}
