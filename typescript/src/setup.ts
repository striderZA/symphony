import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadWorkflow } from './workflow'
import { buildServiceConfig, validateDispatchConfig } from './config'

const rl = createInterface({ input, output })

async function ask(question: string, defaultValue?: string): Promise<string> {
  const hint = defaultValue ? ` (${defaultValue})` : ''
  const answer = await rl.question(`${question}${hint}: `)
  return answer.trim() || defaultValue || ''
}

async function main() {
  console.log(`
╔══════════════════════════════════════════╗
║     Symphony Setup Wizard                ║
║     OpenCode-powered agent orchestrator  ║
╚══════════════════════════════════════════╝
`)

  const existingApiKey = process.env.LINEAR_API_KEY

  if (existingApiKey) {
    console.log(`  ✓ LINEAR_API_KEY found in environment`)
  }

  const apiKey = (await ask(
    'Linear API key',
    existingApiKey || undefined,
  )) || existingApiKey || ''

  const projectSlug = await ask('Linear project slug (from project URL)')

  const workspaceRoot = await ask(
    'Workspace root directory',
    '~/symphony_workspaces',
  )

  const repoUrl = await ask(
    'Git repository URL to clone (leave blank to skip)',
  )

  const targetBranch = repoUrl
    ? await ask('Target branch', 'main')
    : ''

  const port = await ask('OpenCode server port', '4096')

  const maxAgents = await ask('Max concurrent agents', '5')

  const afterCreate = repoUrl
    ? `export GIT_TERMINAL_PROMPT=0\n  git clone ${repoUrl} .${targetBranch ? `\n  git checkout ${targetBranch}` : ''}`
    : undefined

  const workflowPath = resolve('WORKFLOW.md')

  if (existsSync(workflowPath)) {
    const backup = `${workflowPath}.bak`
    console.log(`\n  ⚠ WORKFLOW.md already exists — backing up to WORKFLOW.md.bak`)
    writeFileSync(backup, readFileSync(workflowPath))
  }

  const workflow = `---
tracker:
  kind: linear
  project_slug: ${projectSlug}
${apiKey && existingApiKey ? `  api_key: $LINEAR_API_KEY` : apiKey ? `  api_key: ${apiKey}` : ''}
opencode:
  server_url: http://localhost:${port}
workspace:
  root: ${workspaceRoot}
hooks:
  after_create: |
    ${(afterCreate ?? '').split('\n').join('\n    ')}
agent:
  max_concurrent_agents: ${maxAgents}
  max_concurrent_agents_by_state:
    # "In Progress": 3
    # "Todo": 2
---

You are working on {{ issue.identifier }}: {{ issue.title }}.

## Repository

The project is cloned at the workspace path. Work inside the workspace directory.

## Workflow

1. Read the issue description and understand the requirements.
2. Create or modify code to address the issue.
3. Ensure tests pass.
4. Update the issue state when done.

## Communication

- When you need to make Linear state transitions or add comments, use the \`linear_graphql\` tool.
- Do not use shell commands for Linear operations.
`

  writeFileSync(workflowPath, workflow)
  console.log(`\n  ✓ WORKFLOW.md created at ${workflowPath}`)

  console.log(`\n── Prerequisites check ──`)

  let ok = true

  try {
    const which = await fetch('http://localhost:' + port + '/global/health', { signal: AbortSignal.timeout(2000) })
    if (which.ok) {
      console.log(`  ✓ OpenCode server reachable at http://localhost:${port}`)
    } else {
      console.log(`  ⚠ OpenCode server responded but unhealthy`)
    }
  } catch {
    console.log(`  ⚠ OpenCode server not reachable at http://localhost:${port}`)
    console.log(`    Start it: opencode serve --port ${port}`)
  }

  if (apiKey) {
    try {
      const test = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: apiKey },
        body: JSON.stringify({ query: '{ viewer { id } }' }),
        signal: AbortSignal.timeout(5000),
      })
      const body = await test.json()
      if (body.data?.viewer?.id) {
        console.log(`  ✓ Linear API key valid`)
      } else {
        console.log(`  ✗ Linear API key rejected: ${JSON.stringify(body.errors)}`)
        ok = false
      }
    } catch (err) {
      console.log(`  ✗ Linear API unreachable: ${err}`)
      ok = false
    }
  }

  // Validate the generated workflow
  try {
    if (existingApiKey) process.env.LINEAR_API_KEY = existingApiKey
    const wf = loadWorkflow(workflowPath)
    const cfg = buildServiceConfig(wf)
    const errs = validateDispatchConfig(cfg)
    if (errs.length > 0) {
      console.log(`  ⚠ Config warnings:`)
      for (const e of errs) console.log(`    - ${e}`)
    } else {
      console.log(`  ✓ Workflow config valid`)
    }
  } catch (err) {
    console.log(`  ✗ Workflow validation failed: ${err}`)
    ok = false
  }

  console.log(``)
  if (!ok) {
    console.log(`Setup complete with warnings. Review WORKFLOW.md before starting.`)
  } else {
    console.log(`Setup complete.`)
  }

  const start = await ask(
    '\nStart Symphony now?',
    'y',
  )

  if (start.toLowerCase() === 'y' || start.toLowerCase() === 'yes') {
    console.log(`\nStarting Symphony...\n`)
    const { spawn } = await import('node:child_process')
    const env: Record<string, string | undefined> = { ...process.env }
    if (apiKey) env.LINEAR_API_KEY = apiKey
    const child = spawn(process.argv[0], [resolve('src/main.ts'), workflowPath], {
      stdio: 'inherit',
      shell: true,
      cwd: process.cwd(),
      env: env as NodeJS.ProcessEnv,
    })
    child.on('exit', (code) => process.exit(code ?? 0))
  }

  rl.close()
}

main().catch((err) => { console.error('Setup failed:', err); process.exit(1) })
