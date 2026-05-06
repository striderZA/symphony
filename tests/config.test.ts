import { describe, it, expect } from 'vitest'
import { buildServiceConfig, validateDispatchConfig } from '../src/config'
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
})
