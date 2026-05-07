import { describe, it, expect, vi } from 'vitest'
import { AgentRunner } from '../src/agent_runner'
import type { OpenCodeClient } from '../src/opencode_client'
import type { Issue } from '../src/models'

describe('AgentRunner', () => {
  it('creates session and sends prompt', async () => {
    const client: OpenCodeClient = {
      createSession: vi.fn().mockResolvedValue('session-1'),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      getSessionStatus: vi.fn().mockResolvedValue({ id: 'session-1', status: 'completed' }),
      deleteSession: vi.fn(),
    }
    const runner = new AgentRunner(client)
    const issue = { id: 'abc', identifier: 'MT-1', title: 'Test', state: 'Todo' } as Issue
    const result = await runner.run(issue, 'Work on this')
    expect(result.success).toBe(true)
    expect(result.sessionId).toBe('session-1')
    expect(client.createSession).toHaveBeenCalledWith('MT-1: Test')
  })

  it('handles session failure', async () => {
    const client: OpenCodeClient = {
      createSession: vi.fn().mockResolvedValue('session-2'),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      getSessionStatus: vi.fn().mockResolvedValue({ id: 'session-2', status: 'failed' }),
      deleteSession: vi.fn(),
    }
    const runner = new AgentRunner(client)
    const issue = { id: 'abc', identifier: 'MT-1', title: 'Test', state: 'Todo' } as Issue
    const result = await runner.run(issue, 'Work')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Session failed')
  })

  it('handles client errors', async () => {
    const client: OpenCodeClient = {
      createSession: vi.fn().mockRejectedValue(new Error('Connection refused')),
      sendMessage: vi.fn(), getSessionStatus: vi.fn(), deleteSession: vi.fn(),
    }
    const runner = new AgentRunner(client)
    const issue = { id: 'abc', identifier: 'MT-1', title: 'Test', state: 'Todo' } as Issue
    const result = await runner.run(issue, 'Work')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Connection refused')
  })
})
