import { describe, it, expect, vi } from 'vitest'
import { AgentRunner } from '../src/agent_runner'
import type { OpenCodeClient } from '../src/opencode_client'
import type { Issue } from '../src/models'

function mockClient(overrides?: Partial<OpenCodeClient>): OpenCodeClient {
  return {
    createSession: vi.fn().mockResolvedValue('session-1'),
    sendPromptAsync: vi.fn().mockResolvedValue(undefined),
    autoAllowPermissions: vi.fn().mockResolvedValue(undefined),
    streamEvents: vi.fn().mockResolvedValue(undefined),
    waitForSessionIdle: vi.fn().mockResolvedValue({}),
    deleteSession: vi.fn(),
    ...overrides,
  }
}

describe('AgentRunner', () => {
  it('creates session, sends prompt, waits for idle', async () => {
    const client = mockClient()
    const runner = new AgentRunner(client)
    const issue = { id: 'abc', identifier: 'MT-1', title: 'Test', state: 'Todo' } as Issue
    const result = await runner.run(issue, 'Work on this')
    expect(result.success).toBe(true)
    expect(result.sessionId).toBe('session-1')
    expect(client.createSession).toHaveBeenCalledWith('MT-1: Test')
    expect(client.sendPromptAsync).toHaveBeenCalledWith('session-1', 'Work on this')
    expect(client.waitForSessionIdle).toHaveBeenCalled()
  })

  it('calls session created callback', async () => {
    const client = mockClient()
    const runner = new AgentRunner(client)
    const cb = vi.fn()
    runner.setSessionCreatedCallback(cb)
    const issue = { id: 'abc', identifier: 'MT-1', title: 'Test', state: 'Todo' } as Issue
    await runner.run(issue, 'Work')
    expect(cb).toHaveBeenCalledWith('session-1')
  })

  it('handles session errors', async () => {
    const client = mockClient({ waitForSessionIdle: vi.fn().mockResolvedValue({ error: 'session_error' }) })
    const runner = new AgentRunner(client)
    const issue = { id: 'abc', identifier: 'MT-1', title: 'Test', state: 'Todo' } as Issue
    const result = await runner.run(issue, 'Work')
    expect(result.success).toBe(false)
    expect(result.error).toBe('session_error')
  })

  it('handles client errors', async () => {
    const client = mockClient({ createSession: vi.fn().mockRejectedValue(new Error('Connection refused')) })
    const runner = new AgentRunner(client)
    const issue = { id: 'abc', identifier: 'MT-1', title: 'Test', state: 'Todo' } as Issue
    const result = await runner.run(issue, 'Work')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Connection refused')
  })
})
