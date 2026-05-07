import { describe, it, expect } from 'vitest'
import { parseCliArgs } from '../src/cli'

describe('parseCliArgs', () => {
  it('defaults when no args provided', () => {
    const args = parseCliArgs([])
    expect(args.workflowPath).toBeNull()
    expect(args.port).toBeNull()
    expect(args.logsRoot).toBeNull()
    expect(args.acknowledged).toBe(false)
  })

  it('parses workflow path', () => {
    const args = parseCliArgs(['./my/WORKFLOW.md'])
    expect(args.workflowPath).toBe('./my/WORKFLOW.md')
  })

  it('parses --port flag', () => {
    const args = parseCliArgs(['--port', '8080'])
    expect(args.port).toBe(8080)
  })

  it('parses --logs-root flag', () => {
    const args = parseCliArgs(['--logs-root', '/var/log/symphony'])
    expect(args.logsRoot).toBe('/var/log/symphony')
  })

  it('parses acknowledgement flag', () => {
    const args = parseCliArgs(['--i-understand-that-this-will-be-running-without-the-usual-guardrails'])
    expect(args.acknowledged).toBe(true)
  })

  it('combines all flags', () => {
    const args = parseCliArgs([
      '--port', '8080',
      '--logs-root', './logs',
      'path/to/WORKFLOW.md',
      '--i-understand-that-this-will-be-running-without-the-usual-guardrails',
    ])
    expect(args.port).toBe(8080)
    expect(args.logsRoot).toBe('./logs')
    expect(args.workflowPath).toBe('path/to/WORKFLOW.md')
    expect(args.acknowledged).toBe(true)
  })

  it('defaults to start command', () => {
    const args = parseCliArgs(['./WORKFLOW.md'])
    expect(args.command).toBe('start')
    expect(args.workflowPath).toBe('./WORKFLOW.md')
  })

  it('parses status subcommand', () => {
    const args = parseCliArgs(['status'])
    expect(args.command).toBe('status')
  })

  it('parses status subcommand with port', () => {
    const args = parseCliArgs(['status', '--port', '9090'])
    expect(args.command).toBe('status')
    expect(args.port).toBe(9090)
  })

  it('parses stop subcommand with issue id', () => {
    const args = parseCliArgs(['stop', 'issue-123'])
    expect(args.command).toBe('stop')
    expect(args.stopIssueId).toBe('issue-123')
  })

  it('parses start subcommand explicitly', () => {
    const args = parseCliArgs(['start', './my/WORKFLOW.md', '--i-understand-that-this-will-be-running-without-the-usual-guardrails'])
    expect(args.command).toBe('start')
    expect(args.workflowPath).toBe('./my/WORKFLOW.md')
    expect(args.acknowledged).toBe(true)
  })
})
