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
