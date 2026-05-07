import pino from 'pino'

let logger: pino.Logger = pino({
  level: process.env.SYMPHONY_LOG_LEVEL || 'info',
})

export function configureLogging(options?: { level?: string; path?: string }): void {
  logger = pino({
    level: options?.level || process.env.SYMPHONY_LOG_LEVEL || 'info',
    transport: options?.path
      ? { target: 'pino/file', options: { destination: options.path } }
      : undefined,
  })
}

export function getLogger(): pino.Logger {
  return logger
}

export function withIssueContext(base: pino.Logger, ctx: { issueId: string; issueIdentifier: string }): pino.Logger {
  return base.child({ issue_id: ctx.issueId, issue_identifier: ctx.issueIdentifier })
}

export function withSessionContext(base: pino.Logger, sessionId: string): pino.Logger {
  return base.child({ session_id: sessionId })
}
