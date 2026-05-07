import { describe, it, expect, vi } from 'vitest'
import { executeTool, toolSpecs } from '../src/dynamic_tool'

describe('dynamic_tool', () => {
  it('returns tool specs for linear_graphql', () => {
    const specs = toolSpecs()
    expect(specs).toHaveLength(1)
    expect(specs[0].name).toBe('linear_graphql')
  })

  it('executes linear_graphql with query', async () => {
    const mockClient = vi.fn().mockResolvedValue({ data: { viewer: { id: 'user-1' } } })
    const result = await executeTool('linear_graphql', { query: '{ viewer { id } }' }, mockClient)
    expect(result.success).toBe(true)
    expect(mockClient).toHaveBeenCalledWith('{ viewer { id } }', undefined)
  })

  it('rejects unsupported tool', async () => {
    const result = await executeTool('unsupported_tool', {}, vi.fn())
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unsupported dynamic tool')
  })

  it('rejects multiple operations in query', async () => {
    const result = await executeTool('linear_graphql', {
      query: '{ viewer { id } } mutation { issueUpdate { success } }',
    }, vi.fn())
    expect(result.success).toBe(false)
  })

  it('rejects empty query', async () => {
    const result = await executeTool('linear_graphql', { query: '' }, vi.fn())
    expect(result.success).toBe(false)
  })
})
