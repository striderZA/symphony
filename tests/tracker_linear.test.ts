import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LinearTracker } from '../src/tracker/linear'

describe('LinearTracker', () => {
  const config = { endpoint: 'https://api.linear.app/graphql', apiKey: 'test-key', projectSlug: 'my-project', activeStates: ['Todo', 'In Progress'], terminalStates: ['Done'] }
  const mockFetch = vi.fn()

  beforeEach(() => { vi.stubGlobal('fetch', mockFetch) })
  afterEach(() => { vi.unstubAllGlobals(); mockFetch.mockReset() })

  it('fetches and normalizes candidate issues', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { issues: { nodes: [{ id: 'abc-123', identifier: 'MT-649', title: 'Fix login', state: { name: 'In Progress' }, priority: 1, labels: { nodes: [{ name: 'Bug' }] }, children: { nodes: [] }, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-02T00:00:00Z' }] } } }),
    })
    const tracker = new LinearTracker(config)
    const issues = await tracker.fetchCandidateIssues()
    expect(issues).toHaveLength(1)
    expect(issues[0].identifier).toBe('MT-649')
    expect(issues[0].labels).toEqual(['bug'])
  })

  it('throws on GraphQL errors', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ errors: [{ message: 'Not authorized' }] }) })
    const tracker = new LinearTracker(config)
    await expect(tracker.fetchCandidateIssues()).rejects.toThrow('Not authorized')
  })
})
