import { describe, it, expect } from 'vitest'
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
})
