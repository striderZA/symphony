import { describe, it, expect } from 'vitest'
import { configureLogging, getLogger } from '../src/log'

describe('log', () => {
  it('returns a logger', () => {
    const log = getLogger()
    expect(log).toBeDefined()
    expect(typeof log.info).toBe('function')
  })

  it('can be reconfigured', () => {
    configureLogging({ level: 'debug' })
    const log = getLogger()
    expect(log.level).toBe('debug')
  })
})
