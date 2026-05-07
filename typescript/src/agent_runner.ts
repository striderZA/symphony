import type { Issue } from './models'
import { getLogger } from './log'
import type { OpencodeClient } from '@opencode-ai/sdk/v2'

export interface AgentRunResult {
  sessionId: string | null
  success: boolean
  error?: string
}

/** Matches the SDK's PermissionRule — inlined to avoid subpath export issues */
type PermissionRule = { permission: string; pattern: string; action: 'allow' | 'deny' | 'ask' }

const PERMISSIONS: PermissionRule[] = [
  { permission: 'edit',               pattern: '*', action: 'allow' },
  { permission: 'bash',               pattern: '*', action: 'allow' },
  { permission: 'webfetch',           pattern: '*', action: 'allow' },
  { permission: 'doom_loop',          pattern: '*', action: 'allow' },
  { permission: 'external_directory', pattern: '*', action: 'allow' },
]

export class AgentRunner {
  private onSessionCreated: ((sessionId: string) => void) | null = null

  constructor(private client: OpencodeClient) {}

  setSessionCreatedCallback(cb: (sessionId: string) => void): void {
    this.onSessionCreated = cb
  }

  async run(issue: Issue, prompt: string): Promise<AgentRunResult> {
    const log = getLogger()
    let sessionId: string | null = null
    try {
      const created = await this.client.session.create({
        title: `${issue.identifier}: ${issue.title}`,
        permission: PERMISSIONS,
      })
      sessionId = created.data!.id
      log.info({ issueId: issue.id, sessionId }, 'session_created')
      this.onSessionCreated?.(sessionId)

      const result = await this.client.session.prompt({
        sessionID: sessionId,
        parts: [{ type: 'text', text: prompt }],
      })

      if (result.error) {
        const errMsg = typeof result.error === 'string' ? result.error : 'prompt_error'
        log.warn({ issueId: issue.id, sessionId, error: errMsg }, 'session_error')
        return { sessionId, success: false, error: errMsg }
      }

      log.info({ issueId: issue.id, sessionId }, 'prompt_completed')
      return { sessionId, success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error({ issueId: issue.id, error: message }, 'agent_run_failed')
      return { sessionId: null, success: false, error: message }
    }
  }
}
