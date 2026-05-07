import { describe, it, expect } from 'vitest'
import type { LiveSession } from '../src/models'
import { createOrchestratorState, createCodexTotals } from '../src/models'

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

  it('creates a LiveSession', () => {
    const ls: LiveSession = {
      sessionId: 's1', threadId: 't1', turnId: 't1',
      codexAppServerPid: null,
      lastCodexEvent: null, lastCodexTimestamp: null, lastCodexMessage: '',
      codexInputTokens: 0, codexOutputTokens: 0, codexTotalTokens: 0,
      lastReportedInputTokens: 0, lastReportedOutputTokens: 0, lastReportedTotalTokens: 0,
      turnCount: 0,
    }
    expect(ls.sessionId).toBe('s1')
    expect(ls.turnCount).toBe(0)
  })
})
