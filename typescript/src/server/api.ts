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
