import type { OrchestratorState } from '../models'
import { buildSnapshot } from '../status'

export interface ApiStateResponse {
  generated_at: string
  max_agents: number
  rate_limits: unknown
  polling: { next_poll_in_ms: number } | null
  counts: { running: number; retrying: number }
  running: Array<{
    issue_id: string
    issue_identifier: string
    state: string
    session_id: string | null
    pid: string | null
    turn_count: number
    runtime_seconds: number
    codex_total_tokens: number
    last_event: string | null
    last_message: string
    started_at: string | null
  }>
  retrying: Array<{
    issue_id: string
    identifier: string
    attempt: number
    due_at_ms: number
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
  const snap = buildSnapshot(orchState)
  return {
    generated_at: snap.generatedAt,
    max_agents: snap.maxAgents,
    rate_limits: snap.rateLimits,
    polling: snap.polling ? { next_poll_in_ms: snap.polling.nextPollInMs } : null,
    counts: snap.counts,
    running: snap.running.map((r) => ({
      issue_id: r.issueId,
      issue_identifier: r.issueIdentifier,
      state: r.state,
      session_id: r.sessionId,
      pid: r.pid,
      turn_count: r.turnCount,
      runtime_seconds: r.runtimeSeconds,
      codex_total_tokens: r.codexTotalTokens,
      last_event: r.lastCodexEvent,
      last_message: r.lastCodexMessage,
      started_at: r.startedAt,
    })),
    retrying: snap.retrying.map((r) => ({
      issue_id: r.issueId,
      identifier: r.identifier,
      attempt: r.attempt,
      due_at_ms: r.dueAtMs,
      error: r.error,
    })),
    codex_totals: {
      input_tokens: snap.codexTotals.inputTokens,
      output_tokens: snap.codexTotals.outputTokens,
      total_tokens: snap.codexTotals.totalTokens,
      seconds_running: snap.codexTotals.secondsRunning,
    },
  }
}
