import { getLogger } from './log'

export interface OpenCodeClient {
  createSession(title: string): Promise<string>
  sendPromptAsync(sessionId: string, prompt: string): Promise<void>
  autoAllowPermissions(): Promise<void>
  streamEvents(opts: { sessionId: string; issueId: string; signal: AbortSignal }): Promise<void>
  waitForSessionIdle(sessionId: string, opts: { signal: AbortSignal }): Promise<{ error?: string }>
  deleteSession(sessionId: string): Promise<void>
}

export class HttpOpenCodeClient implements OpenCodeClient {
  constructor(private baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async createSession(title: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    if (!res.ok) throw new Error(`Failed to create session: ${res.status}`)
    const data = await res.json() as { id: string }
    return data.id
  }

  async autoAllowPermissions(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/config`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permission: { edit: 'allow', bash: { '*': 'allow' }, webfetch: 'allow', doom_loop: 'allow', external_directory: 'allow' } }) })
    if (!res.ok) getLogger().warn({ status: res.status }, 'permission_config_failed')
  }

  async sendPromptAsync(sessionId: string, prompt: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/session/${sessionId}/prompt_async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts: [{ type: 'text', text: prompt }] }),
    })
    if (!res.ok) throw new Error(`Failed to send prompt: ${res.status}`)
  }

  async streamEvents(opts: { sessionId: string; issueId: string; signal: AbortSignal }): Promise<void> {
    const log = getLogger()
    try {
      const res = await fetch(`${this.baseUrl}/event`, { signal: opts.signal, headers: { 'Accept': 'text/event-stream' } })
      if (!res.ok || !res.body) return
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          try {
            const event = JSON.parse(line.slice(5).trim())
            // Only log events for our session
            const props = event.properties ?? {}
            if (props.sessionID !== opts.sessionId) continue

            switch (event.type) {
              case 'message.part.updated': {
                const p = props.part
                if (p.type === 'tool' && p.state?.status === 'running') {
                  log.info({ issueId: opts.issueId, tool: p.tool, title: p.state.title }, 'tool_running')
                } else if (p.type === 'tool' && p.state?.status === 'completed') {
                  log.info({ issueId: opts.issueId, tool: p.tool, outputLen: p.state.output?.length }, 'tool_completed')
                } else if (p.type === 'tool' && p.state?.status === 'error') {
                  log.warn({ issueId: opts.issueId, tool: p.tool, error: p.state.error }, 'tool_error')
                } else if (p.type === 'step-start') {
                  log.info({ issueId: opts.issueId }, 'agent_step_start')
                } else if (p.type === 'text' && p.delta) {
                  // Delta stream fragments — skip for now, too noisy
                } else if (p.type === 'text') {
                  log.info({ issueId: opts.issueId, length: p.text?.length }, 'agent_text')
                }
                break
              }
              case 'permission.updated': {
                const perm = props as { id: string; type: string; title: string; sessionID: string }
                log.info({ issueId: opts.issueId, permId: perm.id, type: perm.type, title: perm.title }, 'permission_requested')
                // Auto-approve
                try {
                  await fetch(`${this.baseUrl}/session/${opts.sessionId}/permissions/${perm.id}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ response: 'allow', remember: true }),
                  })
                  log.info({ issueId: opts.issueId, permId: perm.id }, 'permission_auto_approved')
                } catch { /* ignore */ }
                break
              }
              case 'session.error': {
                log.error({ issueId: opts.issueId, error: props.error }, 'session_error_event')
                break
              }
              case 'session.status': {
                log.info({ issueId: opts.issueId, status: props.status?.type }, 'session_status_event')
                break
              }
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err: unknown) {
      const e = err as { name?: string }
      if (e.name !== 'AbortError') throw err
    }
  }

  async waitForSessionIdle(sessionId: string, opts: { signal: AbortSignal }): Promise<{ error?: string }> {
    const log = getLogger()
    let attempt = 0
    while (!opts.signal.aborted) {
      attempt++
      try {
        const res = await fetch(`${this.baseUrl}/session/status`, { signal: opts.signal })
        if (!res.ok) throw new Error(`Status check failed: ${res.status}`)
        const statuses = await res.json() as Record<string, { type: string; error?: { message?: string } }>
        const status = statuses[sessionId]
        if (!status) {
          log.warn({ sessionId }, 'session_not_in_status_response')
          await sleep(1000)
          continue
        }
        if (status.type === 'idle') return {}
        if (status.type === 'error') return { error: 'session_error' }
        // Still busy or retrying — wait
        await sleep(2000)
      } catch (err: unknown) {
        const e = err as { name?: string }
        if (e.name === 'AbortError') break
        // If status endpoint fails, the session might still exist
        await sleep(5000)
      }
    }
    return { error: 'aborted' }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/session/${sessionId}`, { method: 'DELETE' })
    if (!res.ok) getLogger().warn({ sessionId, status: res.status }, 'delete_session_failed')
  }
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)) }
