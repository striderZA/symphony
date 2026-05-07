export interface CliArgs {
  workflowPath: string | null
  port: number | null
  logsRoot: string | null
  acknowledged: boolean
}

const GUARDRAILS_FLAG = '--i-understand-that-this-will-be-running-without-the-usual-guardrails'

export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    workflowPath: null,
    port: null,
    logsRoot: null,
    acknowledged: false,
  }

  let i = 0
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
    } else if (!arg.startsWith('--') && !args.workflowPath) {
      args.workflowPath = arg
      i++
    } else {
      i++
    }
  }

  return args
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
  const lines2 = lines.map((l) => '│ ' + l.padEnd(width) + ' │')
  return [
    '╭' + border + '╮',
    ...lines2,
    '╰' + border + '╯',
  ].join('\n')
}

export function usageMessage(): string {
  return `Usage: symphony [--port <port>] [--logs-root <path>] [--i-understand-that-this-will-be-running-without-the-usual-guardrails] [path-to-WORKFLOW.md]`
}
