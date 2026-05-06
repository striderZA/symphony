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
