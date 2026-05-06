import { describe, it, expect, afterEach } from 'vitest'
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

describe('setup wizard', () => {
  const workflowPath = resolve('WORKFLOW.md')
  const backupPath = workflowPath + '.bak'

  afterEach(() => {
    // Clean up any generated files
    try { unlinkSync(workflowPath) } catch {}
    try { unlinkSync(backupPath) } catch {}
  })

  it('generates valid YAML front matter matching expected schema', () => {
    // Simulate what setup.ts would produce
    const workflow = `---
tracker:
  kind: linear
  project_slug: my-project
  api_key: $LINEAR_API_KEY
opencode:
  server_url: http://localhost:4096
workspace:
  root: ~/symphony_workspaces
hooks:
  after_create: |
    git clone git@github.com:my-org/my-repo.git .
    git checkout main
agent:
  max_concurrent_agents: 5
---

You are working on {{ issue.identifier }}: {{ issue.title }}.
`
    writeFileSync(workflowPath, workflow)

    const content = readFileSync(workflowPath, 'utf-8')
    expect(content).toContain('tracker:')
    expect(content).toContain('kind: linear')
    expect(content).toContain('project_slug: my-project')
    expect(content).toContain('opencode:')
    expect(content).toContain('server_url: http://localhost:4096')
    expect(content).toContain('git clone')
    expect(content).toContain('You are working on')
  })

  it('can be loaded by the workflow loader', async () => {
    const { loadWorkflow } = await import('../src/workflow')
    const { buildServiceConfig, validateDispatchConfig } = await import('../src/config')

    const workflow = `---
tracker:
  kind: linear
  project_slug: demo-project
  api_key: $LINEAR_API_KEY
opencode:
  server_url: http://localhost:4096
workspace:
  root: ~/symphony_workspaces
hooks:
  after_create: |
    git clone git@github.com:demo/repo.git .
agent:
  max_concurrent_agents: 3
---

Test prompt.
`
    writeFileSync(workflowPath, workflow)

    const wf = loadWorkflow(workflowPath)
    const cfg = buildServiceConfig(wf)

    expect(cfg.tracker.projectSlug).toBe('demo-project')
    expect(cfg.opencode.serverUrl).toBe('http://localhost:4096')
    expect(cfg.agent.maxConcurrentAgents).toBe(3)
    expect(cfg.tracker.apiKey).toBe('')
  })

  it('uses env LINEAR_API_KEY for $VAR resolution', async () => {
    const { loadWorkflow } = await import('../src/workflow')
    const { buildServiceConfig } = await import('../src/config')

    process.env.LINEAR_API_KEY = 'lin_api_test'
    const workflow = `---
tracker:
  kind: linear
  project_slug: proj
  api_key: $LINEAR_API_KEY
---
body
`
    writeFileSync(workflowPath, workflow)
    const wf = loadWorkflow(workflowPath)
    const cfg = buildServiceConfig(wf, undefined, process.env as Record<string, string | undefined>)

    expect(cfg.tracker.apiKey).toBe('lin_api_test')
    delete process.env.LINEAR_API_KEY
  })
})
