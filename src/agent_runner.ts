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
    try {
      const sessionId = await this.client.createSession(`${issue.identifier}: ${issue.title}`)
      log.info({ issueId: issue.id, sessionId }, 'session_created')
      this.onSessionCreated?.(sessionId)

      // Sync call — blocks until the AI fully responds
      await this.client.sendMessage(sessionId, prompt)
      log.info({ issueId: issue.id, sessionId }, 'prompt_completed')

      return { sessionId, success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error({ issueId: issue.id, error: message }, 'agent_run_failed')
      return { sessionId: null, success: false, error: message }
    }
  }
}
