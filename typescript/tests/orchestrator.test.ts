import { describe, it, expect } from 'vitest'
import { shouldDispatch, dispatchKey, availableSlots, backoffDelay } from '../src/orchestrator'
import { createOrchestratorState } from '../src/models'
import type { Issue } from '../src/models'

describe('dispatchKey', () => {
  it('sorts by priority ascending', () => {
    const a = { identifier: 'A-1', priority: 1, createdAt: null } as Issue
    const b = { identifier: 'B-1', priority: 2, createdAt: null } as Issue
    expect(dispatchKey(a) < dispatchKey(b)).toBe(true)
  })
  it('sorts null priority last', () => {
    const a = { identifier: 'A-1', priority: null, createdAt: null } as Issue
    const b = { identifier: 'B-1', priority: 1, createdAt: null } as Issue
    expect(dispatchKey(a) > dispatchKey(b)).toBe(true)
  })
})

describe('shouldDispatch', () => {
  it('allows eligible issue', () => {
    const issue = { id: '1', identifier: 'A-1', title: 't', state: 'Todo', blockedBy: [] } as Issue
    expect(shouldDispatch(issue, createOrchestratorState())).toBe(true)
  })
  it('rejects already running issue', () => {
    const issue = { id: '1', identifier: 'A-1', title: 't', state: 'Todo' } as Issue
    const state = createOrchestratorState(); state.running.set('1', {} as any)
    expect(shouldDispatch(issue, state)).toBe(false)
  })
  it('rejects claimed issue', () => {
    const issue = { id: '1', identifier: 'A-1', title: 't', state: 'Todo' } as Issue
    const state = createOrchestratorState(); state.claimed.add('1')
    expect(shouldDispatch(issue, state)).toBe(false)
  })
  it('rejects todo with active blockers', () => {
    const issue = { id: '1', identifier: 'A-1', title: 't', state: 'Todo', blockedBy: [{ id: 'b1', identifier: 'B-1', state: 'In Progress' }] } as Issue
    expect(shouldDispatch(issue, createOrchestratorState())).toBe(false)
  })
})

describe('availableSlots', () => {
  it('returns max when no running', () => {
    expect(availableSlots(createOrchestratorState({ maxConcurrentAgents: 10 }))).toBe(10)
  })
})

describe('backoffDelay', () => {
  it('caps at maxBackoffMs', () => { expect(backoffDelay(10, 300000)).toBe(300000) })
  it('computes exponential delay', () => {
    expect(backoffDelay(1)).toBe(10000)
    expect(backoffDelay(2)).toBe(20000)
    expect(backoffDelay(3)).toBe(40000)
  })
})
