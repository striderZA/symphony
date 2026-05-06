import type { Issue } from './models'
import type { OpenCodeClient } from './opencode_client'
import { getLogger } from './log'

export interface AgentRunResult {
  sessionId: string | null
  success: boolean
  error?: string
}

export class AgentRunner {
  private onSessionCreated: ((sessionId: string) => void) | null = null

  constructor(private client: OpenCodeClient) {}

  setSessionCreatedCallback(cb: (sessionId: string) => void): void {
    this.onSessionCreated = cb
  }

  async run(issue: Issue, prompt: string): Promise<AgentRunResult> {
    const log = getLogger()
    let sessionId: string | null = null
    try {
      sessionId = await this.client.createSession(`${issue.identifier}: ${issue.title}`)
      log.info({ issueId: issue.id, sessionId }, 'session_created')
      this.onSessionCreated?.(sessionId)

      await this.client.autoAllowPermissions()
      await this.client.sendPromptAsync(sessionId, prompt)
      log.info({ issueId: issue.id, sessionId }, 'prompt_sent')

      // Stream events and log agent activity while waiting for completion
      const abort = new AbortController()
      const eventStream = this.client.streamEvents({ sessionId, issueId: issue.id, signal: abort.signal })
      const result = await this.client.waitForSessionIdle(sessionId, { signal: abort.signal })

      abort.abort()
      try { await eventStream } catch { /* expected abort */ }

      if (result.error) {
        log.warn({ issueId: issue.id, sessionId, error: result.error }, 'session_error')
        return { sessionId, success: false, error: result.error }
      }

      log.info({ issueId: issue.id, sessionId }, 'session_idle')
      return { sessionId, success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error({ issueId: issue.id, error: message }, 'agent_run_failed')
      return { sessionId: null, success: false, error: message }
    }
  }
}
