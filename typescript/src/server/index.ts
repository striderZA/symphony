import type { OrchestratorState } from '../models'
import { buildApiState } from './api'
import { renderDashboard } from './dashboard'
import { getLogger } from '../log'

export interface ServerConfig {
  port: number
  host: string
}

export function startServer(config: ServerConfig, getState: () => OrchestratorState): { stop: () => void } {
  const log = getLogger()
  log.info({ port: config.port, host: config.host }, 'http_server_starting')

  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    async fetch(req) {
      const url = new URL(req.url)
      const state = getState()

      if (url.pathname === '/api/v1/state') {
        const body = buildApiState(state)
        return new Response(JSON.stringify(body), {
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const dashboard = renderDashboard(buildApiState(state))
      return new Response(dashboard, {
        headers: { 'Content-Type': 'text/html' },
      })
    },
  })

  log.info({ port: server.port }, 'http_server_started')
  return { stop: () => server.stop() }
}
