import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { WorkspaceManager } from '../src/workspace'
import { execHook } from '../src/hooks'

vi.mock('../src/hooks', () => ({
  execHook: vi.fn().mockResolvedValue({ success: true, stdout: '', stderr: '', error: null }),
}))

let testRoot: string

beforeEach(() => {
  testRoot = join(tmpdir(), `symphony-ws-test-${Date.now()}`)
  mkdirSync(testRoot, { recursive: true })
})

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true })
})

describe('WorkspaceManager', () => {
  it('creates workspace for an issue', () => {
    const wm = new WorkspaceManager({ root: testRoot })
    const ws = wm.createForIssue('ABC-123')
    expect(ws.workspaceKey).toBe('ABC-123')
    expect(existsSync(ws.path)).toBe(true)
    expect(ws.createdNow).toBe(true)
  })

  it('reuses existing workspace', () => {
    const wm = new WorkspaceManager({ root: testRoot })
    const ws1 = wm.createForIssue('ABC-123')
    const ws2 = wm.createForIssue('ABC-123')
    expect(ws1.path).toBe(ws2.path)
    expect(ws1.createdNow).toBe(true)
    expect(ws2.createdNow).toBe(false)
  })

  it('sanitizes workspace key', () => {
    const wm = new WorkspaceManager({ root: testRoot })
    const ws = wm.createForIssue('MT-649: fix bug')
    expect(ws.workspaceKey).toBe('MT-649__fix_bug')
  })

  it('fires after_create hook for new workspace', () => {
    const wm = new WorkspaceManager({ root: testRoot, afterCreate: 'mock-cmd' })
    const ws = wm.createForIssue('AFTER-1')
    expect(ws.createdNow).toBe(true)
    expect(execHook).toHaveBeenCalledWith('mock-cmd', ws.path, 60000)
  })

  it('does not throw when after_create hook fails', () => {
    vi.mocked(execHook).mockRejectedValueOnce(new Error('hook failed'))
    const wm = new WorkspaceManager({ root: testRoot, afterCreate: 'fail-cmd' })
    expect(() => wm.createForIssue('AFTER-2')).not.toThrow()
  })
})
