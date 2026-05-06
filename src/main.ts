import { WorkflowStore } from './workflow_store'
import { validateDispatchConfig } from './config'
import { configureLogging, getLogger } from './log'
import { SymphonyOrchestrator } from './orchestrator'
import { AgentRunner } from './agent_runner'
import { HttpOpenCodeClient } from './opencode_client'
import { WorkspaceManager } from './workspace'
import { LinearTracker } from './tracker/linear'
import { logSnapshot } from './status'

async function main(): Promise<void> {
  const args = parseArgs()
  const logLevel = process.env.SYMPHONY_LOG_LEVEL || 'info'
  configureLogging({ level: logLevel })
  const log = getLogger()
  log.info('symphony_starting')

  const store = new WorkflowStore(args.workflowPath)
  if (store.workflow === null) {
    log.error({ error: store.lastError }, 'workflow_load_failed')
    process.exit(1)
  }
  const config = store.config!

  const errors = validateDispatchConfig(config)
  if (errors.length > 0) {
    for (const err of errors) log.error({ error: err }, 'config_validation_failed')
    process.exit(1)
  }

  log.info({ trackerKind: config.tracker.kind, projectSlug: config.tracker.projectSlug }, 'symphony_config_loaded')

  const tracker = new LinearTracker({
    endpoint: config.tracker.endpoint, apiKey: config.tracker.apiKey, projectSlug: config.tracker.projectSlug,
    activeStates: config.tracker.activeStates, terminalStates: config.tracker.terminalStates,
  })

  const wsManager = new WorkspaceManager({
    root: config.workspace.root, afterCreate: config.hooks.afterCreate, beforeRun: config.hooks.beforeRun,
    afterRun: config.hooks.afterRun, beforeRemove: config.hooks.beforeRemove, hookTimeoutMs: config.hooks.timeoutMs,
  })

  const opencodeClient = new HttpOpenCodeClient(config.opencode.serverUrl)

  if (config.opencode.serverStartCommand) {
    const { execSync } = await import('node:child_process')
    execSync(config.opencode.serverStartCommand, { stdio: 'inherit', cwd: process.cwd() })
  }

  try {
    const health = await fetch(`${config.opencode.serverUrl}/global/health`)
    if (!health.ok) throw new Error(`Health check returned ${health.status}`)
    log.info({ serverUrl: config.opencode.serverUrl }, 'opencode_server_connected')
  } catch (err) {
    log.error({ error: String(err) }, 'opencode_server_unreachable')
    process.exit(1)
  }

  const agentRunner = new AgentRunner(opencodeClient)
  const orch = new SymphonyOrchestrator({
    tracker, agentRunner, workspaceManager: wsManager,
    maxConcurrent: config.agent.maxConcurrentAgents, pollIntervalMs: config.polling.intervalMs,
    activeStates: config.tracker.activeStates, terminalStates: config.tracker.terminalStates,
    maxTurns: config.agent.maxTurns, maxRetryBackoffMs: config.agent.maxRetryBackoffMs,
    stallTimeoutMs: config.opencode.stallTimeoutMs, maxConcurrentByState: config.agent.maxConcurrentAgentsByState,
  })

  orch.addObserver((state) => logSnapshot(state))
  const shutdown = () => { log.info('shutdown_requested'); orch.stop() }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  log.info('symphony_started')
  await orch.run()
  log.info('symphony_stopped')
}

interface CliArgs { workflowPath: string | null }
function parseArgs(): CliArgs {
  const args: CliArgs = { workflowPath: null }
  for (let i = 2; i < process.argv.length; i++) {
    if (!args.workflowPath) args.workflowPath = process.argv[i]
  }
  return args
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1) })
