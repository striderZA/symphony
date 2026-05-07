import type { OrchestratorState } from '../models'
import { buildApiState } from './api'
import { renderDashboard } from './dashboard'
import { getLogger } from '../log'

export interface ServerConfig {
  port: number
  host: string
}

export type IssueStopper = (issueId: string) => boolean

export function startServer(config: ServerConfig, getState: () => OrchestratorState, stopIssue?: IssueStopper): { stop: () => void } {
  const log = getLogger()
  log.info({ port: config.port, host: config.host }, 'http_server_starting')

  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    async fetch(req) {
      const url = new URL(req.url)
      const state = getState()

      if (req.method === 'POST' && url.pathname.startsWith('/api/v1/issue/') && url.pathname.endsWith('/stop')) {
        const issueId = url.pathname.split('/')[4]
        if (!issueId) return new Response('Missing issue ID', { status: 400 })
        if (!stopIssue) return new Response('Stop not available', { status: 501 })
        const ok = stopIssue(issueId)
        return new Response(JSON.stringify({ stopped: ok }), {
          headers: { 'Content-Type': 'application/json' },
          status: ok ? 200 : 404,
        })
      }

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
