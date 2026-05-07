import { describe, it, expect, vi } from 'vitest'
import { AgentRunner } from '../src/agent_runner'

function mockClient(opts?: {
  createFail?: boolean
  promptFail?: boolean
}) {
  return {
    session: {
      create: opts?.createFail
        ? vi.fn().mockRejectedValue(new Error('create failed'))
        : vi.fn().mockResolvedValue({ data: { id: 'session-1' } }),
      prompt: opts?.promptFail
        ? vi.fn().mockResolvedValue({ error: 'prompt failed' })
        : vi.fn().mockResolvedValue({ data: {} }),
    },
  } as any
}

describe('AgentRunner', () => {
  it('creates session and sends prompt', async () => {
    const client = mockClient()
    const runner = new AgentRunner(client)
    const result = await runner.run({ id: 'abc', identifier: 'MT-1', title: 'Test' }, 'Work on this')
    expect(result.success).toBe(true)
    expect(result.sessionId).toBe('session-1')
    expect(client.session.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'MT-1: Test',
    }))
    expect(client.session.prompt).toHaveBeenCalledWith(
      expect.objectContaining({ sessionID: 'session-1' })
    )
  })

  it('handles createSession failure', async () => {
    const client = mockClient({ createFail: true })
    const runner = new AgentRunner(client)
    const result = await runner.run({ id: 'abc', identifier: 'MT-1', title: 'Test' }, 'Work')
    expect(result.success).toBe(false)
    expect(result.error).toContain('create failed')
  })

  it('handles prompt API error', async () => {
    const client = mockClient({ promptFail: true })
    const runner = new AgentRunner(client)
    const result = await runner.run({ id: 'abc', identifier: 'MT-1', title: 'Test' }, 'Work')
    expect(result.success).toBe(false)
    expect(result.error).toBe('prompt_failed')
  })

  it('handles prompt network error', async () => {
    const client = {
      session: {
        create: vi.fn().mockResolvedValue({ data: { id: 'session-1' } }),
        prompt: vi.fn().mockRejectedValue(new Error('network error')),
      },
    } as any
    const runner = new AgentRunner(client)
    const result = await runner.run({ id: 'abc', identifier: 'MT-1', title: 'Test' }, 'Work')
    expect(result.success).toBe(false)
    expect(result.error).toContain('network error')
  })

  it('includes permissions in session create', async () => {
    const client = mockClient()
    const runner = new AgentRunner(client)
    await runner.run({ id: 'abc', identifier: 'MT-1', title: 'Test' }, 'do work')
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
