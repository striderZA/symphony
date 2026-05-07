import type { Issue } from './models'
import type { OpenCodeClient } from './opencode_client'
import { getLogger, withIssueContext } from './log'

const CONTINUATION_GUIDANCE = (turn: number, maxTurns: number) => `
Continuation guidance:

- The previous Codex turn completed normally, but the Linear issue is still in an active state.
- This is continuation turn ${turn} of ${maxTurns} for the current agent run.
- Resume from the current workspace state instead of restarting from scratch.
- The original task instructions are already present in this thread.
- Focus on the remaining ticket work.
`

export interface AgentRunResult {
  sessionId: string | null
  success: boolean
  error?: string
  turnsCompleted: number
}

export interface AgentRunnerConfig {
  maxTurns: number
  issueStateFetcher: (issueIds: string[]) => Promise<Issue[]>
}

export class AgentRunner {
  constructor(
    private client: OpenCodeClient,
    private config: AgentRunnerConfig,
  ) {}

  async run(issue: Issue, prompt: string): Promise<AgentRunResult> {
    const log = withIssueContext(getLogger(), { issueId: issue.id, issueIdentifier: issue.identifier })
    let turnsCompleted = 0
    let currentSessionId: string | null = null

    try {
      currentSessionId = await this.client.createSession(`${issue.identifier}: ${issue.title}`)
      log.info({ sessionId: currentSessionId }, 'session_created')

      const { threadId, turnId: firstTurnId } = await this.client.startTurn(currentSessionId)
      log.info({ sessionId: currentSessionId, threadId, turnId: firstTurnId }, 'first_turn_started')

      await this.client.sendMessage(currentSessionId, prompt)
      turnsCompleted = 1

      for (let turn = 2; turn <= this.config.maxTurns; turn++) {
        const refreshedIssue = await this.refreshIssueState(issue.id)
        if (!refreshedIssue || !this.isActiveState(refreshedIssue.state)) {
          log.info({ turnsCompleted: turn - 1 }, 'issue_no_longer_active')
          break
        }

        const { turnId } = await this.client.startTurn(currentSessionId)
        log.info({ sessionId: currentSessionId, turnId, turnNum: turn }, 'continuation_turn_started')

        await this.client.sendMessage(currentSessionId, CONTINUATION_GUIDANCE(turn, this.config.maxTurns))
        turnsCompleted = turn
      }

      log.info({ turnsCompleted }, 'agent_run_completed')
      return { sessionId: currentSessionId, success: true, turnsCompleted }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log.error({ error: message }, 'agent_run_failed')
      return { sessionId: currentSessionId, success: false, error: message, turnsCompleted }
    }
  }

  private async refreshIssueState(issueId: string): Promise<Issue | null> {
    try {
      const issues = await this.config.issueStateFetcher([issueId])
      return issues[0] ?? null
    } catch {
      return null
    }
  }

  private isActiveState(state: string): boolean {
    const terminalStates = ['closed', 'cancelled', 'canceled', 'duplicate', 'done']
    return !terminalStates.includes(state.toLowerCase())
  }
}
