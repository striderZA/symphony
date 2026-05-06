import type { Issue } from './models'
import type { OpenCodeClient, SessionStatus } from './opencode_client'
import { getLogger } from './log'

export interface AgentRunResult {
  sessionId: string | null
  success: boolean
  error?: string
}

export class AgentRunner {
  constructor(private client: OpenCodeClient) {}

  async run(issue: Issue, prompt: string): Promise<AgentRunResult> {
    const log = getLogger()
    try {
      const sessionId = await this.client.createSession(`${issue.identifier}: ${issue.title}`)
      log.info({ issueId: issue.id, sessionId }, 'session_created')
      await this.client.sendMessage(sessionId, prompt)
      log.info({ issueId: issue.id, sessionId }, 'prompt_sent')

      const status = await this.pollForCompletion(sessionId)
      return { sessionId, success: status.status === 'completed' || status.status === 'idle', error: status.status === 'failed' ? 'Session failed' : undefined }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error({ issueId: issue.id, error: message }, 'agent_run_failed')
      return { sessionId: null, success: false, error: message }
    }
  }

  private async pollForCompletion(sessionId: string): Promise<SessionStatus> {
    const maxAttempts = 60
    const pollIntervalMs = 5000
    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.client.getSessionStatus(sessionId)
      if (status.status !== 'active') return status
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }
    throw new Error('Session did not complete within poll limit')
  }
}
