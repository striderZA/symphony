import { describe, it, expect } from 'vitest'
import { buildServiceConfig, validateDispatchConfig, parseAndValidateConfig } from '../src/config'
import type { WorkflowDefinition } from '../src/models'

describe('buildServiceConfig', () => {
  it('builds config with defaults for missing fields', () => {
    const wf: WorkflowDefinition = { config: {}, promptTemplate: 'test' }
    const cfg = buildServiceConfig(wf)
    expect(cfg.tracker.kind).toBe('')
    expect(cfg.polling.intervalMs).toBe(30000)
    expect(cfg.agent.maxConcurrentAgents).toBe(10)
    expect(cfg.agent.maxTurns).toBe(20)
    expect(cfg.agent.maxRetryBackoffMs).toBe(300000)
    expect(cfg.opencode.serverUrl).toBe('http://localhost:4096')
    expect(cfg.opencode.serverStartCommand).toBeNull()
    expect(cfg.opencode.stallTimeoutMs).toBe(300000)
    expect(cfg.opencode.sessionTimeoutMs).toBe(3600000)
    expect(cfg.hooks.timeoutMs).toBe(60000)
  })

  it('resolves $VAR references from environment', () => {
    process.env.TEST_API_KEY = 'secret-123'
    const wf: WorkflowDefinition = {
      config: { tracker: { api_key: '$TEST_API_KEY', kind: 'linear', project_slug: 'proj' } },
      promptTemplate: '',
    }
    const cfg = buildServiceConfig(wf)
    expect(cfg.tracker.apiKey).toBe('secret-123')
    delete process.env.TEST_API_KEY
  })

  it('parses tracker config', () => {
    const wf: WorkflowDefinition = {
      config: { tracker: { kind: 'linear', project_slug: 'my-project', active_states: ['In Progress'] } },
      promptTemplate: '',
    }
    const cfg = buildServiceConfig(wf)
    expect(cfg.tracker.kind).toBe('linear')
    expect(cfg.tracker.projectSlug).toBe('my-project')
    expect(cfg.tracker.activeStates).toEqual(['In Progress'])
  })

  it('parses opencode config', () => {
    const wf: WorkflowDefinition = {
      config: { opencode: { server_url: 'http://localhost:4097', server_start_command: 'opencode serve --port 4097', stall_timeout_ms: 60000, session_timeout_ms: 1800000 } },
      promptTemplate: '',
    }
    const cfg = buildServiceConfig(wf)
    expect(cfg.opencode.serverUrl).toBe('http://localhost:4097')
    expect(cfg.opencode.serverStartCommand).toBe('opencode serve --port 4097')
    expect(cfg.opencode.stallTimeoutMs).toBe(60000)
    expect(cfg.opencode.sessionTimeoutMs).toBe(1800000)
  })

  it('builds default endpoint for linear tracker', () => {
    const wf: WorkflowDefinition = { config: { tracker: { kind: 'linear' } }, promptTemplate: '' }
    const cfg = buildServiceConfig(wf)
    expect(cfg.tracker.endpoint).toBe('https://api.linear.app/graphql')
  })
})

describe('validateDispatchConfig', () => {
  it('returns errors for missing tracker kind', () => {
    const wf: WorkflowDefinition = { config: {}, promptTemplate: '' }
    const cfg = buildServiceConfig(wf)
    const errors = validateDispatchConfig(cfg)
    expect(errors).toContain('tracker.kind is required')
  })

  it('returns error for unsupported tracker kind', () => {
    const wf: WorkflowDefinition = { config: { tracker: { kind: 'jira' } }, promptTemplate: '' }
    const cfg = buildServiceConfig(wf)
    const errors = validateDispatchConfig(cfg)
    expect(errors).toContain('unsupported tracker.kind: jira')
  })

  it('returns error for missing projectSlug when kind is linear', () => {
    const wf: WorkflowDefinition = { config: { tracker: { kind: 'linear', api_key: 'key' } }, promptTemplate: '' }
    const cfg = buildServiceConfig(wf)
    const errors = validateDispatchConfig(cfg)
    expect(errors).toContain('tracker.project_slug is required for linear tracker')
  })
})

describe('codex and server schema', () => {
  it('parses codex section defaults', () => {
    const wf: WorkflowDefinition = { config: {}, promptTemplate: '' }
    const cfg = buildServiceConfig(wf)
    expect(cfg.codex.command).toBe('codex app-server')
    expect(cfg.codex.turnTimeoutMs).toBe(3600000)
    expect(cfg.codex.readTimeoutMs).toBe(5000)
    expect(cfg.codex.stallTimeoutMs).toBe(300000)
    expect(cfg.codex.approvalPolicy).toBe('never')
    expect(cfg.codex.threadSandbox).toBe('workspace-write')
    expect(cfg.codex.turnSandboxPolicy).toEqual({})
  })

  it('parses codex section from front matter', () => {
    const wf: WorkflowDefinition = {
      config: {
        codex: {
          command: 'custom-codex',
          turn_timeout_ms: 5000,
          approval_policy: 'always',
        },
      },
      promptTemplate: '',
    }
    const cfg = buildServiceConfig(wf)
    expect(cfg.codex.command).toBe('custom-codex')
    expect(cfg.codex.turnTimeoutMs).toBe(5000)
    expect(cfg.codex.approvalPolicy).toBe('always')
    expect(cfg.codex.readTimeoutMs).toBe(5000)
    expect(cfg.codex.stallTimeoutMs).toBe(300000)
    expect(cfg.codex.threadSandbox).toBe('workspace-write')
  })

  it('parses server section from front matter', () => {
    const wf: WorkflowDefinition = {
      config: { server: { port: 8080, host: '0.0.0.0' } },
      promptTemplate: '',
    }
    const cfg = buildServiceConfig(wf)
    expect(cfg.server.port).toBe(8080)
    expect(cfg.server.host).toBe('0.0.0.0')
  })

  it('rejects invalid max_turns', () => {
    const wf: WorkflowDefinition = {
      config: { agent: { max_turns: -1 } },
      promptTemplate: '',
    }
    expect(() => buildServiceConfig(wf)).toThrow()
  })

  it('applies defaults for empty config', () => {
    const { config } = parseAndValidateConfig({ config: {}, promptTemplate: '' } as WorkflowDefinition)
    expect(config.tracker.kind).toBe('')
    expect(config.polling.intervalMs).toBe(30000)
    expect(config.agent.maxTurns).toBe(20)
    expect(config.codex.command).toBe('codex app-server')
    expect(config.server.port).toBeNull()
    expect(config.server.host).toBe('127.0.0.1')
  })
})
