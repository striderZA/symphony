import { describe, it, expect, vi } from 'vitest'
import { AgentRunner } from '../src/agent_runner'
import type { OpenCodeClient, SessionStatus } from '../src/opencode_client'
import type { Issue } from '../src/models'

function makeClient(overrides?: Partial<OpenCodeClient>): OpenCodeClient {
  return {
    createSession: vi.fn().mockResolvedValue('session-1'),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    getSessionStatus: vi.fn().mockResolvedValue({ id: 'session-1', status: 'completed' } as SessionStatus),
    deleteSession: vi.fn(),
    startTurn: vi.fn().mockResolvedValue({ threadId: 't1', turnId: 'turn-1' }),
    ...overrides,
  }
}

function makeIssue(overrides?: Partial<Issue>): Issue {
  return {
    id: 'issue-1', identifier: 'TICKET-1', title: 'Test', state: 'In Progress',
    description: null, priority: null, branchName: null, url: null,
    labels: [], blockedBy: [], createdAt: null, updatedAt: null,
    ...overrides,
  } as Issue
}

describe('AgentRunner', () => {
  it('creates session and sends prompt', async () => {
    const client = makeClient()
    const runner = new AgentRunner(client, {
      maxTurns: 1,
      issueStateFetcher: async () => [makeIssue({ state: 'Done' })],
    })
    const issue = makeIssue({ id: 'abc', identifier: 'MT-1', title: 'Test', state: 'Todo' })
    const result = await runner.run(issue, 'Work on this')
    expect(result.success).toBe(true)
    expect(result.sessionId).toBe('session-1')
    expect(client.createSession).toHaveBeenCalledWith('MT-1: Test')
  })

  it('handles send failure', async () => {
    const client = makeClient({
      sendMessage: vi.fn().mockRejectedValue(new Error('Send failed')),
    })
    const runner = new AgentRunner(client, {
      maxTurns: 1,
      issueStateFetcher: async () => [makeIssue({ state: 'Done' })],
    })
    const issue = makeIssue({ id: 'abc', identifier: 'MT-1', title: 'Test', state: 'Todo' })
    const result = await runner.run(issue, 'Work')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Send failed')
  })

  it('handles client errors', async () => {
    const client = makeClient({
      createSession: vi.fn().mockRejectedValue(new Error('Connection refused')),
    })
    const runner = new AgentRunner(client, {
      maxTurns: 1,
      issueStateFetcher: async () => [makeIssue({ state: 'Done' })],
    })
    const issue = makeIssue({ id: 'abc', identifier: 'MT-1', title: 'Test', state: 'Todo' })
    const result = await runner.run(issue, 'Work')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Connection refused')
  })
})

describe('AgentRunner continuation turns', () => {
  it('loops through multiple turns when issue stays active', async () => {
    let turnCount = 0
    const client: OpenCodeClient = {
      createSession: vi.fn().mockResolvedValue('session-1'),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      getSessionStatus: vi.fn().mockImplementation(async () => {
        turnCount++
        return { id: 'session-1', status: 'completed' } as SessionStatus
      }),
      deleteSession: vi.fn(),
      startTurn: vi.fn().mockResolvedValue({ threadId: 't1', turnId: 'turn-1' }),
    }
    const runner = new AgentRunner(client, {
      maxTurns: 3,
      issueStateFetcher: async () => [makeIssue()],
    })
    const result = await runner.run(makeIssue(), 'do work')
    expect(result.success).toBe(true)
    expect(client.sendMessage).toHaveBeenCalledTimes(3)
  })

  it('stops looping when issue state is no longer active', async () => {
    const client: OpenCodeClient = {
      createSession: vi.fn().mockResolvedValue('session-1'),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      getSessionStatus: vi.fn().mockResolvedValue({ id: 'session-1', status: 'completed' } as SessionStatus),
      deleteSession: vi.fn(),
      startTurn: vi.fn().mockResolvedValue({ threadId: 't1', turnId: 'turn-1' }),
    }
    const runner = new AgentRunner(client, {
      maxTurns: 10,
      issueStateFetcher: async () => [makeIssue({ state: 'Done' })],
    })
    const result = await runner.run(makeIssue(), 'do work')
    expect(result.success).toBe(true)
    expect(client.sendMessage).toHaveBeenCalledTimes(1)
  })
})
