/**
 * Test a WORKFLOW.md prompt against a live opencode server without the
 * full Symphony orchestrator.
 *
 * Usage:
 *   bun src/test-prompt.ts [--issue ISSUE-42] [--url http://localhost:4096] [--dry-run] [path/to/WORKFLOW.md]
 *
 *   --dry-run  Only render and print the prompt; do not connect to a server.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createOpencodeClient } from '@opencode-ai/sdk/v2'
import { renderPrompt } from './prompt_builder'
import { loadWorkflow } from './workflow'
import type { Issue } from './models'

const args = parseArgs()
const workflowPath = args.workflowPath
  ? resolve(args.workflowPath)
  : lookupWorkflow(process.cwd())
const serverUrl = args.url ?? 'http://localhost:4096'
const dryRun = args.dryRun

const workflow = loadWorkflow(workflowPath)

const mockIssue: Issue = {
  id: 'mock-1',
  identifier: args.issue ?? 'TEST-1',
  title: 'Test prompt execution',
  state: 'Todo',
  description: 'This is a test issue. Use the workflow to work through it as you normally would.',
  priority: null,
  branchName: null,
  url: null,
  labels: [],
  blockedBy: [],
  createdAt: new Date(),
  updatedAt: new Date(),
}

const prompt = renderPrompt(workflow.promptTemplate, mockIssue, null)

console.log(prompt)

if (dryRun) process.exit(0)

console.error(`\nServer: ${serverUrl}`)
console.error(`Issue:  ${mockIssue.identifier}\n`)

const client = createOpencodeClient({ baseUrl: serverUrl })
const created = await client.session.create({
  title: `${mockIssue.identifier}: ${mockIssue.title}`,
  permission: [
    { permission: 'edit',               pattern: '*', action: 'allow' },
    { permission: 'bash',               pattern: '*', action: 'allow' },
    { permission: 'webfetch',           pattern: '*', action: 'allow' },
    { permission: 'doom_loop',          pattern: '*', action: 'allow' },
    { permission: 'external_directory', pattern: '*', action: 'allow' },
  ],
})
const sessionId = created.data!.id
console.error(`Session: ${sessionId}`)
console.error(`Monitor: ${serverUrl.replace(/\/$/, '')}/session/${sessionId}\n`)

console.error('Sending prompt (blocking until AI completes)...')
const result = await client.session.prompt({
  sessionID: sessionId,
  parts: [{ type: 'text', text: prompt }],
})
if (result.error) { console.error(`Error: ${result.error}`); process.exit(1) }
console.error('Done.')

function lookupWorkflow(dir: string): string {
  const local = resolve(dir, 'WORKFLOW.md')
  if (existsSync(local)) return local
  const parent = resolve(dir, '..', 'WORKFLOW.md')
  if (existsSync(parent)) return parent
  return local
}

function parseArgs() {
  const argv = process.argv.slice(2)
  const out: Record<string, string> & { dryRun?: boolean } = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--issue' && i + 1 < argv.length) out.issue = argv[++i]
    else if (argv[i] === '--url' && i + 1 < argv.length) out.url = argv[++i]
    else if (argv[i] === '--dry-run') out.dryRun = true
    else out.workflowPath = argv[i]
  }
  return out
}
