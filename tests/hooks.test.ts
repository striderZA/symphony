import { describe, it, expect } from 'vitest'
import { execHook } from '../src/hooks'
import { tmpdir } from 'node:os'

const cwd = tmpdir()

describe('execHook', () => {
  it('executes a simple command and returns success', async () => {
    const result = await execHook('echo hello', cwd, 5000)
    expect(result.success).toBe(true)
  })

  it('fails on non-zero exit', async () => {
    const result = await execHook('exit 1', cwd, 5000)
    expect(result.success).toBe(false)
  })

  it('times out when command exceeds limit', async () => {
    const result = await execHook('timeout /t 10 /nobreak >nul', cwd, 100)
    expect(result.success).toBe(false)
    expect(result.error).toContain('timed out')
  })
})
