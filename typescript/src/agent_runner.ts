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

      await this.client.session.promptAsync({
        sessionID: sessionId,
        parts: [{ type: 'text', text: prompt }],
      })
      log.info({ issueId: issue.id, sessionId }, 'prompt_sent')

      const result = await detectSessionResult(this.client, sessionId, issue.id, log)

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

async function detectSessionResult(
  client: OpencodeClient,
  sessionID: string,
  issueID: string,
  log: ReturnType<typeof getLogger>,
): Promise<{ error?: string }> {
  const abort = new AbortController()

  try {
    const sse = await client.event.subscribe(undefined, {
      signal: abort.signal,
    })

    const safetyTimer = setInterval(async () => {
      try {
        const statuses = await client.session.status()
        const s = statuses.data?.[sessionID]
        if (s?.type === 'idle' || s?.type === 'retry') {
          abort.abort()
        }
      } catch { /* safety poll failure is non-fatal */ }
    }, 30_000)

    try {
      for await (const event of sse.stream) {
        if (event.type === 'session.idle') {
          const props = (event as any).properties
          if (props?.sessionID === sessionID) {
            abort.abort()
            log.info({ issueID, sessionID }, 'session_idle_event')
            return {}
          }
        }
        if (event.type === 'session.error') {
          const props = (event as any).properties
          if (props?.sessionID === sessionID) {
            abort.abort()
            const errMsg = props?.error?.message ?? 'session_error'
            log.warn({ issueID, sessionID, error: errMsg }, 'session_error_event')
            return { error: errMsg }
          }
        }
        if (event.type === 'permission.asked') {
          const props = (event as any).properties
          if (props?.sessionID === sessionID && props?.id) {
            client.permission.reply({
              requestID: props.id,
              reply: 'always',
            }).catch(() => {})
            log.info({ issueID, sessionID, permId: props.id }, 'permission_auto_approved')
          }
        }
      }
    } finally {
      clearInterval(safetyTimer)
    }

    // SSE stream ended — fall back to explicit status check
    const statuses = await client.session.status()
    const s = statuses.data?.[sessionID]
    if (s?.type === 'idle') return {}
    if (s?.type === 'retry') return { error: s.message || 'session_retry' }
    return { error: 'stream_ended' }
  } catch (err: unknown) {
    if ((err as any)?.name === 'AbortError') {
      // Abort triggered by idle/error event or safety poll — check status
      try {
        const statuses = await client.session.status()
        const s = statuses.data?.[sessionID]
        if (s?.type === 'idle') return {}
        if (s?.type === 'retry') return { error: s.message || 'session_retry' }
      } catch { /* status check failed after abort — assume clean exit */ }
      return {}
    }
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
