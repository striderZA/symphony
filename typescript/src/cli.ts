export type CliCommand = 'start' | 'status' | 'stop'

export interface CliArgs {
  command: CliCommand
  workflowPath: string | null
  port: number | null
  logsRoot: string | null
  acknowledged: boolean
  stopIssueId: string | null
}

const GUARDRAILS_FLAG = '--i-understand-that-this-will-be-running-without-the-usual-guardrails'

const COMMANDS: CliCommand[] = ['start', 'status', 'stop']

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: 'start',
    workflowPath: null,
    port: null,
    logsRoot: null,
    acknowledged: false,
    stopIssueId: null,
  }

  let i = 0

  // First non-flag arg might be a subcommand
  let commandCandidate: string | null = null

  const flags: string[] = []
  while (i < argv.length) {
    const arg = argv[i]
    if (arg === GUARDRAILS_FLAG) {
      args.acknowledged = true
      i++
    } else if (arg === '--port' && i + 1 < argv.length) {
      args.port = parseInt(argv[i + 1], 10)
      i += 2
    } else if (arg === '--logs-root' && i + 1 < argv.length) {
      args.logsRoot = argv[i + 1]
      i += 2
    } else if (!arg.startsWith('--')) {
      if (!commandCandidate) {
        commandCandidate = arg
      }
      i++
    } else {
      i++
    }
  }

  // Check if first positional is a subcommand
  if (commandCandidate && COMMANDS.includes(commandCandidate as CliCommand)) {
    args.command = commandCandidate as CliCommand
    // Remaining positionals depend on command
    const remaining = argv.filter((a) => !a.startsWith('--') && a !== commandCandidate)
    if (args.command === 'stop') {
      args.stopIssueId = remaining[0] ?? null
    } else if (args.command === 'start') {
      args.workflowPath = remaining[0] ?? null
    }
  } else if (commandCandidate) {
    // No subcommand, treat as workflow path (backward compat)
    args.command = 'start'
    args.workflowPath = commandCandidate
  }

  return args
}

function red(s: string): string {
  return `\x1b[31m${s}\x1b[0m`
}

function bright(s: string): string {
  return `\x1b[1m${s}\x1b[0m`
}

export function guardrailsBanner(): string {
  const lines = [
    'This Symphony implementation is a low key engineering preview.',
    'Codex will run without any guardrails.',
    'Symphony is not a supported product and is presented as-is.',
    '',
    `To proceed, start with \`${GUARDRAILS_FLAG}\` CLI argument`,
  ]
  const width = Math.max(...lines.map((l) => l.length))
  const border = '─'.repeat(width + 2)
  const content = lines.map((l) => `│ ${l.padEnd(width)} │`)
  return red(bright([
    `╭${border}╮`,
    `│ ${''.padEnd(width)} │`,
    ...content,
    `│ ${''.padEnd(width)} │`,
    `╰${border}╯`,
  ].join('\n')))
}

export function usageMessage(): string {
  return [
    'Usage: symphony <command> [options] [path-to-WORKFLOW.md]',
    '',
    'Commands:',
    '  start                 Run the orchestrator (default)',
    '  status                Show current runtime state from running server',
    '  stop <issue-id>       Stop a running issue by ID',
    '',
    'Options:',
    '  --port <port>         HTTP dashboard port (default: from WORKFLOW.md or 8080)',
    '  --logs-root <path>    Log file directory',
    `  ${GUARDRAILS_FLAG}  Required acknowledgement for start command`,
  ].join('\n')
}
