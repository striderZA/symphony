import { describe, it, expect, vi } from 'vitest'
import { shouldDispatch, dispatchKey, availableSlots, backoffDelay, SymphonyOrchestrator } from '../src/orchestrator'
import { createOrchestratorState } from '../src/models'
import type { Issue } from '../src/models'

function makeIssue(overrides?: Partial<Issue>): Issue {
  return {
    id: 'issue-1', identifier: 'TICKET-1', title: 'Test', state: 'In Progress',
    description: null, priority: null, branchName: null, url: null,
    labels: [], blockedBy: [], createdAt: null, updatedAt: null,
    ...overrides,
  }
}

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
  it('treats attempt 0 as attempt 1', () => {
    expect(backoffDelay(0)).toBe(10000)
  })
})

describe('startupCleanup', () => {
  it('calls workspaceManager.removeForIssue for terminal issues', async () => {
    const tracker = {
      fetchCandidateIssues: vi.fn().mockResolvedValue([]),
      fetchIssuesByStates: vi.fn().mockResolvedValue([
        makeIssue({ id: 'done-1', identifier: 'TICKET-1', state: 'Done' }),
      ]),
      fetchIssueStatesByIds: vi.fn().mockResolvedValue([]),
    }
    const agentRunner = { run: vi.fn() }
    const workspaceManager = { removeForIssue: vi.fn(), createForIssue: vi.fn(), runBeforeRun: vi.fn(), runAfterRun: vi.fn() }
    const orch = new SymphonyOrchestrator({
      tracker: tracker as any,
      agentRunner: agentRunner as any,
      workspaceManager: workspaceManager as any,
    })

    await (orch as any).startupCleanup()

    expect(workspaceManager.removeForIssue).toHaveBeenCalledWith('TICKET-1')
    expect(tracker.fetchIssuesByStates).toHaveBeenCalled()
  })
})

describe('orchestrator reconciliation Part B', () => {
  it('terminates runs for issues that moved to terminal state', async () => {
    const tracker = {
      fetchCandidateIssues: vi.fn().mockResolvedValue([]),
      fetchIssuesByStates: vi.fn().mockResolvedValue([]),
      fetchIssueStatesByIds: vi.fn().mockResolvedValue([
        makeIssue({ id: 'run-1', state: 'Done' }),
      ]),
    }
    const agentRunner = { run: vi.fn() }
    const orch = new SymphonyOrchestrator({ tracker: tracker as any, agentRunner: agentRunner as any })

    orch.state.running.set('run-1', {
      issueId: 'run-1', identifier: 'TICKET-1',
      issue: makeIssue({ id: 'run-1', state: 'In Progress' }),
      sessionId: null, lastCodexEvent: null, lastCodexTimestamp: null, lastCodexMessage: '',
      codexInputTokens: 0, codexOutputTokens: 0, codexTotalTokens: 0,
      lastReportedInputTokens: 0, lastReportedOutputTokens: 0, lastReportedTotalTokens: 0,
      retryAttempt: 0, startedAt: new Date(),
      task: Promise.resolve(), cancel: null,
      session: null,
    })
    orch.state.claimed.add('run-1')

    const state = await orch.reconcileTrackerStates()
    expect(state.running.has('run-1')).toBe(false)
    expect(state.claimed.has('run-1')).toBe(false)
    expect(tracker.fetchIssueStatesByIds).toHaveBeenCalledWith(['run-1'])
  })

  it('keeps running issues that are still active', async () => {
    const tracker = {
      fetchCandidateIssues: vi.fn().mockResolvedValue([]),
      fetchIssuesByStates: vi.fn().mockResolvedValue([]),
      fetchIssueStatesByIds: vi.fn().mockResolvedValue([
        makeIssue({ id: 'run-1', state: 'In Progress' }),
      ]),
    }
    const agentRunner = { run: vi.fn() }
    const orch = new SymphonyOrchestrator({ tracker: tracker as any, agentRunner: agentRunner as any })

    orch.state.running.set('run-1', {
      issueId: 'run-1', identifier: 'TICKET-1',
      issue: makeIssue({ id: 'run-1', state: 'In Progress' }),
      sessionId: null, lastCodexEvent: null, lastCodexTimestamp: null, lastCodexMessage: '',
      codexInputTokens: 0, codexOutputTokens: 0, codexTotalTokens: 0,
      lastReportedInputTokens: 0, lastReportedOutputTokens: 0, lastReportedTotalTokens: 0,
      retryAttempt: 0, startedAt: new Date(),
      task: Promise.resolve(), cancel: null,
      session: null,
    })

    const state = await orch.reconcileTrackerStates()
    expect(state.running.has('run-1')).toBe(true)
  })
})
