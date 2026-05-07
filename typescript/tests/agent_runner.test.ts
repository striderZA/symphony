import { describe, it, expect, vi } from 'vitest'
import { AgentRunner } from '../src/agent_runner'
import type { Issue } from '../src/models'

function makeIssue(overrides?: Partial<Issue>): Issue {
  return {
    id: 'issue-1', identifier: 'TICKET-1', title: 'Test', state: 'In Progress',
    description: null, priority: null, branchName: null, url: null,
    labels: [], blockedBy: [], createdAt: null, updatedAt: null,
    ...overrides,
  } as Issue
}

/**
 * Create a mock OpencodeClient.
 *
 * By default the SSE stream yields a `session.idle` event immediately,
 * causing detectSessionResult to resolve without waiting for the 30s
 * safety poll timer.
 */
function mockClient(opts?: {
  createFail?: boolean
  promptFail?: boolean
  streamItems?: Array<{ type: string; properties: Record<string, unknown> }>
}) {
  const stream = (async function* () {
    const items = opts?.streamItems ?? [
      { type: 'session.idle', properties: { sessionID: 'session-1' } },
    ]
    for (const item of items) {
      yield item as any
    }
    // Keep stream alive (resolves immediately after yielding all items)
    await new Promise(() => {})
  })()

  return {
    session: {
      create: opts?.createFail
        ? vi.fn().mockRejectedValue(new Error('create failed'))
        : vi.fn().mockResolvedValue({ data: { id: 'session-1' } }),
      promptAsync: opts?.promptFail
        ? vi.fn().mockRejectedValue(new Error('prompt failed'))
        : vi.fn().mockResolvedValue({ data: {} }),
      status: vi.fn().mockResolvedValue({
        data: { 'session-1': { type: 'idle' as const } },
      }),
      delete: vi.fn().mockResolvedValue({ data: {} }),
    },
    event: {
      subscribe: vi.fn().mockResolvedValue({ stream }),
    },
    permission: {
      reply: vi.fn().mockResolvedValue({ data: {} }),
    },
  } as any
}

describe('AgentRunner (SDK v2)', () => {
  it('creates session and sends prompt, detects idle from SSE', async () => {
    const client = mockClient()
    const runner = new AgentRunner(client)
    const issue = makeIssue({ id: 'abc', identifier: 'MT-1', title: 'Test', state: 'Todo' })
    const result = await runner.run(issue, 'Work on this')
    expect(result.success).toBe(true)
    expect(result.sessionId).toBe('session-1')
    expect(client.session.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'MT-1: Test',
    }))
    expect(client.session.promptAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sessionID: 'session-1' })
    )
  })

  it('handles createSession failure', async () => {
    const client = mockClient({ createFail: true })
    const runner = new AgentRunner(client)
    const result = await runner.run(makeIssue(), 'Work')
    expect(result.success).toBe(false)
    expect(result.error).toContain('create failed')
  })

  it('handles promptAsync failure', async () => {
    const client = mockClient({ promptFail: true })
    const runner = new AgentRunner(client)
    const result = await runner.run(makeIssue(), 'Work')
    expect(result.success).toBe(false)
    expect(result.error).toContain('prompt failed')
  })

  it('handles session error event from SSE', async () => {
    const client = mockClient({
      streamItems: [
        { type: 'session.error', properties: { sessionID: 'session-1', error: { message: 'model error' } } },
      ],
    })
    const runner = new AgentRunner(client)
    const result = await runner.run(makeIssue(), 'Work')
    expect(result.success).toBe(false)
    expect(result.error).toContain('model error')
  })

  it('auto-approves permission.asked events', async () => {
    const client = mockClient({
      streamItems: [
        { type: 'permission.asked', properties: { sessionID: 'session-1', id: 'perm-1' } },
        { type: 'session.idle', properties: { sessionID: 'session-1' } },
      ],
    })
    const runner = new AgentRunner(client)
    await runner.run(makeIssue(), 'Work')
    expect(client.permission.reply).toHaveBeenCalledWith(
      expect.objectContaining({ requestID: 'perm-1', reply: 'always' })
    )
  })

  it('includes permissions in session create', async () => {
    const client = mockClient()
    const runner = new AgentRunner(client)
    await runner.run(makeIssue(), 'do work')
    expect(client.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: expect.arrayContaining([
          expect.objectContaining({ permission: 'edit', pattern: '*', action: 'allow' }),
          expect.objectContaining({ permission: 'bash', pattern: '*', action: 'allow' }),
          expect.objectContaining({ permission: 'doom_loop', pattern: '*', action: 'allow' }),
          expect.objectContaining({ permission: 'external_directory', pattern: '*', action: 'allow' }),
        ]),
      })
    )
  })
})
