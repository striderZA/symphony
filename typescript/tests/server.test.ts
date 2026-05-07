import { describe, it, expect } from 'vitest'
import { buildApiState } from '../src/server/api'
import { createOrchestratorState } from '../src/models'
import type { RunningEntry } from '../src/models'

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
    const entry: RunningEntry = {
      issueId: '1', identifier: 'TICKET-1',
      issue: { id: '1', identifier: 'TICKET-1', title: 'test', state: 'In Progress', description: null, priority: null, branchName: null, url: null, labels: [], blockedBy: [], createdAt: null, updatedAt: null },
      sessionId: 'sess-1', lastCodexEvent: null, lastCodexTimestamp: null, lastCodexMessage: '',
      codexInputTokens: 100, codexOutputTokens: 50, codexTotalTokens: 150,
      lastReportedInputTokens: 0, lastReportedOutputTokens: 0, lastReportedTotalTokens: 0,
      retryAttempt: 3, startedAt: new Date(), task: null, cancel: null,
      session: null,
    }
    state.running.set('1', entry)
    const result = buildApiState(state)
    expect(result.running).toHaveLength(1)
    expect(result.running[0].turn_count).toBe(3)
  })
})
