import { WorkflowStore } from './workflow_store'
import { validateDispatchConfig } from './config'
import { configureLogging, getLogger } from './log'
import { SymphonyOrchestrator } from './orchestrator'
import { AgentRunner } from './agent_runner'
import { createOpencodeClient } from '@opencode-ai/sdk/v2'
import { WorkspaceManager } from './workspace'
import { LinearTracker } from './tracker/linear'
import { logSnapshot } from './status'
import { parseCliArgs, guardrailsBanner } from './cli'

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2))

  if (!args.acknowledged) {
    console.error(guardrailsBanner())
    process.exit(1)
  }

  const logLevel = process.env.SYMPHONY_LOG_LEVEL || 'info'
  configureLogging({ level: logLevel, path: args.logsRoot ? `${args.logsRoot}/symphony.log` : undefined })
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

  const client = createOpencodeClient({ baseUrl: config.opencode.serverUrl })

  if (config.opencode.serverStartCommand) {
    const { spawn } = await import('node:child_process')
    const child = spawn(config.opencode.serverStartCommand, { stdio: 'inherit', shell: true, cwd: process.cwd(), detached: true })
    child.unref()
    await new Promise((r) => setTimeout(r, 2000))
  }

  try {
    const health = await fetch(`${config.opencode.serverUrl}/global/health`, { signal: AbortSignal.timeout(5000) })
    if (!health.ok) throw new Error(`Health check returned ${health.status}`)
    log.info({ serverUrl: config.opencode.serverUrl }, 'opencode_server_connected')
  } catch (err) {
    log.warn({ error: String(err), serverUrl: config.opencode.serverUrl }, 'opencode_health_check_failed')
    log.warn('Proceeding despite health check failure; first session request will confirm connectivity')
  }

  const agentRunner = new AgentRunner(client, {
    maxTurns: config.agent.maxTurns,
    issueStateFetcher: (ids) => tracker.fetchIssueStatesByIds(ids),
  })
  const orch = new SymphonyOrchestrator({
    tracker, agentRunner, workspaceManager: wsManager,
    promptTemplate: store.workflow?.promptTemplate,
    maxConcurrent: config.agent.maxConcurrentAgents, pollIntervalMs: config.polling.intervalMs,
    activeStates: config.tracker.activeStates, terminalStates: config.tracker.terminalStates,
    maxTurns: config.agent.maxTurns, maxRetryBackoffMs: config.agent.maxRetryBackoffMs,
    stallTimeoutMs: config.opencode.stallTimeoutMs, maxConcurrentByState: config.agent.maxConcurrentAgentsByState,
  })

  const serverPort = args.port ?? (config as any).server?.port
  let server: { stop: () => void } | null = null
  if (serverPort && serverPort > 0) {
    const { startServer } = await import('./server/index')
    server = startServer(
      { port: serverPort, host: (config as any).server?.host ?? '127.0.0.1' },
      () => orch.state,
      (issueId) => orch.stopIssue(issueId),
    )
  }

  const dashboardUrl =
    serverPort && serverPort > 0
      ? `http://${(config as any).server?.host && (config as any).server.host !== '0.0.0.0' ? (config as any).server.host : '127.0.0.1'}:${serverPort}/`
      : undefined
  const { startTerminalDashboard } = await import('./dashboard_terminal')
  const dashboard = startTerminalDashboard(() => orch.state, {
    projectSlug: (config as any).tracker?.projectSlug,
    dashboardUrl,
  })

  orch.addObserver((state) => logSnapshot(state))
  const shutdown = () => {
    log.info('shutdown_requested')
    orch.stop()
    dashboard.stop()
    if (server) server.stop()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  log.info('symphony_started')
  await orch.run()
  log.info('symphony_stopped')
  process.exit(0)
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1) })
