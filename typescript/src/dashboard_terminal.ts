import type { OrchestratorState } from './models'
import { buildSnapshot } from './status'

const CLEAR = '\x1b[2J'
const HOME = '\x1b[H'
const HIDE = '\x1b[?25l'
const SHOW = '\x1b[?25h'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const GRAY = '\x1b[90m'

let intervalHandle: ReturnType<typeof setInterval> | null = null

export function startTerminalDashboard(getState: () => OrchestratorState): { stop: () => void } {
  process.stdout.write(HIDE)

  const render = () => {
    const snap = buildSnapshot(getState())
    const lines: string[] = [HOME + CLEAR]

    lines.push(` ${BOLD}Symphony${RESET}${DIM}  [Ctrl+C to stop]${RESET}`)
    lines.push(` ${GRAY}${'─'.repeat(60)}${RESET}`)
    lines.push(` ${BOLD}Running:${RESET} ${snap.counts.running}   ${BOLD}Retrying:${RESET} ${snap.counts.retrying}   ${BOLD}Tokens:${RESET} ${snap.codexTotals.totalTokens.toLocaleString()}   ${BOLD}Runtime:${RESET} ${Math.round(snap.codexTotals.secondsRunning)}s`)
    lines.push('')

    if (snap.running.length > 0) {
      lines.push(` ${BOLD}Running Sessions${RESET}`)
      lines.push(` ${GRAY}${pad('Issue', 14)} ${pad('State', 16)} ${pad('Turns', 6)} ${pad('Session', 22)} Last Event${RESET}`)
      lines.push(` ${GRAY}${'─'.repeat(60)}${RESET}`)
      for (const r of snap.running) {
        const stateColor = r.state === 'In Progress' ? GREEN : r.state === 'Todo' ? CYAN : YELLOW
        lines.push(` ${pad(r.issueIdentifier, 14)} ${stateColor}${pad(r.state, 16)}${RESET} ${pad(String(r.turnCount), 6)} ${pad(r.sessionId?.slice(0, 20) ?? '-', 22)} ${r.lastEvent ?? ''}`)
      }
      lines.push('')
    }

    if (snap.retrying.length > 0) {
      lines.push(` ${BOLD}Retry Queue${RESET}`)
      lines.push(` ${GRAY}${pad('Issue', 14)} ${pad('Attempt', 8)} Error${RESET}`)
      lines.push(` ${GRAY}${'─'.repeat(60)}${RESET}`)
      for (const r of snap.retrying) {
        lines.push(` ${pad(r.identifier, 14)} ${pad(String(r.attempt), 8)} ${r.error ?? '-'}`)
      }
      lines.push('')
    }

    if (snap.running.length === 0 && snap.retrying.length === 0) {
      lines.push(` ${DIM}No active sessions. Waiting for work...${RESET}`)
      lines.push('')
    }

    process.stdout.write(lines.join('\n'))
  }

  render()
  intervalHandle = setInterval(render, 2000)

  return {
    stop: () => {
      if (intervalHandle) clearInterval(intervalHandle)
      process.stdout.write(SHOW)
    },
  }
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length)
}
