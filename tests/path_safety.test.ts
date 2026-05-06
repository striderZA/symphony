import { describe, it, expect } from 'vitest'
import { sanitizeWorkspaceKey, checkContainment } from '../src/path_safety'

describe('path_safety', () => {
  describe('sanitizeWorkspaceKey', () => {
    it('passes through valid keys', () => {
      expect(sanitizeWorkspaceKey('ABC-123')).toBe('ABC-123')
      expect(sanitizeWorkspaceKey('my_issue.1')).toBe('my_issue.1')
      expect(sanitizeWorkspaceKey('test-branch')).toBe('test-branch')
    })

    it('replaces invalid characters with underscore', () => {
      expect(sanitizeWorkspaceKey('ABC:123')).toBe('ABC_123')
      expect(sanitizeWorkspaceKey('hello world')).toBe('hello_world')
      expect(sanitizeWorkspaceKey('a/b/c')).toBe('a_b_c')
    })

    it('handles empty string', () => {
      expect(sanitizeWorkspaceKey('')).toBe('')
    })
  })

  describe('checkContainment', () => {
    it('accepts path inside root', () => {
      expect(() => checkContainment('/root/workspace', '/root')).not.toThrow()
    })

    it('rejects path outside root', () => {
      expect(() => checkContainment('/outside', '/root')).toThrow()
    })

    it('accepts nested paths inside root', () => {
      expect(() => checkContainment('/root/a/b/c', '/root')).not.toThrow()
    })
  })
})
