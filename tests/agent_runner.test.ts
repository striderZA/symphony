import { describe, it, expect, vi } from 'vitest'
import { AgentRunner } from '../src/agent_runner'
import type { OpenCodeClient } from '../src/opencode_client'
import type { Issue } from '../src/models'

describe('AgentRunner', () => {
  it('creates session and sends prompt', async () => {
    const client: OpenCodeClient = {
      createSession: vi.fn().mockResolvedValue('session-1'),
      sendMessage: vi.fn().mockResolvedValue('Task completed'),
      deleteSession: vi.fn(),
    }
    const runner = new AgentRunner(client)
    const issue = { id: 'abc', identifier: 'MT-1', title: 'Test', state: 'Todo' } as Issue
    const result = await runner.run(issue, 'Work on this')
    expect(result.success).toBe(true)
    expect(result.sessionId).toBe('session-1')
    expect(client.createSession).toHaveBeenCalledWith('MT-1: Test')
    expect(client.sendMessage).toHaveBeenCalledWith('session-1', 'Work on this')
  })

  it('calls session created callback', async () => {
    const client: OpenCodeClient = {
      createSession: vi.fn().mockResolvedValue('session-1'),
      sendMessage: vi.fn().mockResolvedValue('done'),
      deleteSession: vi.fn(),
    }
    const runner = new AgentRunner(client)
    const cb = vi.fn()
    runner.setSessionCreatedCallback(cb)
    const issue = { id: 'abc', identifier: 'MT-1', title: 'Test', state: 'Todo' } as Issue
    await runner.run(issue, 'Work')
    expect(cb).toHaveBeenCalledWith('session-1')
  })

  it('handles client errors', async () => {
    const client: OpenCodeClient = {
      createSession: vi.fn().mockRejectedValue(new Error('Connection refused')),
      sendMessage: vi.fn(), deleteSession: vi.fn(),
    }
    const runner = new AgentRunner(client)
    const issue = { id: 'abc', identifier: 'MT-1', title: 'Test', state: 'Todo' } as Issue
    const result = await runner.run(issue, 'Work')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Connection refused')
  })
})
