import type { OrchestratorState } from './models'
import { buildSnapshot, type RuntimeSnapshot, type RunningAgentSnapshot } from './status'

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const BLUE = '\x1b[34m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const ORANGE = '\x1b[33m'
const YELLOW = '\x1b[33m'
const MAGENTA = '\x1b[35m'
const GRAY = '\x1b[90m'

const CLEAR = '\x1b[2J'
const HOME = '\x1b[H'
const HIDE = '\x1b[?25l'
const SHOW = '\x1b[?25h'

const ID_WIDTH = 8
const STAGE_WIDTH = 14
const PID_WIDTH = 8
const AGE_WIDTH = 12
const TOKENS_WIDTH = 10
const SESSION_WIDTH = 14
const MIN_EVENT_WIDTH = 12
const DEFAULT_EVENT_WIDTH = 44
const ROW_CHROME = 10
const THROUGHPUT_WINDOW_MS = 5_000

let intervalHandle: ReturnType<typeof setInterval> | null = null
let tokenSamples: Array<{ ts: number; tokens: number }> = []
let lastTpsSecond: number | null = null
let lastTpsValue: number | null = null

interface DashboardOptions {
  projectSlug?: string
  dashboardUrl?: string
}

export function startTerminalDashboard(
  getState: () => OrchestratorState,
  opts?: DashboardOptions,
): { stop: () => void } {
  process.stdout.write(HIDE)

  const render = () => {
    const state = getState()
    const snap = buildSnapshot(state)
    const now = Date.now()
    const totalTokens = snap.codexTotals.totalTokens

    tokenSamples.push({ ts: now, tokens: totalTokens })
    const minTime = now - THROUGHPUT_WINDOW_MS
    tokenSamples = tokenSamples.filter((s) => s.ts >= minTime)

    const tps = throttledTps(now, totalTokens)

    const terminalCols = terminalColumns()
    const eventWidth = runningEventWidth(terminalCols)
    const lines: string[] = [HOME + CLEAR]

    lines.push(colorize('╭─ SYMPHONY STATUS', BOLD))
    lines.push(
      colorize('│ Agents: ', BOLD) +
        colorize(String(snap.counts.running), GREEN) +
        colorize('/', GRAY) +
        colorize(String(snap.maxAgents), GRAY),
    )
    lines.push(
      colorize('│ Throughput: ', BOLD) + colorize(`${formatTps(tps)} tps`, CYAN),
    )
    lines.push(
      colorize('│ Runtime: ', BOLD) +
        colorize(formatRuntimeSeconds(snap.codexTotals.secondsRunning), MAGENTA),
    )
    lines.push(
      colorize('│ Tokens: ', BOLD) +
        colorize(`in ${formatCount(snap.codexTotals.inputTokens)}`, YELLOW) +
        colorize(' | ', GRAY) +
        colorize(`out ${formatCount(snap.codexTotals.outputTokens)}`, YELLOW) +
        colorize(' | ', GRAY) +
        colorize(`total ${formatCount(snap.codexTotals.totalTokens)}`, YELLOW),
    )
    lines.push(
      colorize('│ Rate Limits: ', BOLD) + formatRateLimits(snap.rateLimits),
    )

    if (opts?.projectSlug) {
      lines.push(
        colorize('│ Project: ', BOLD) +
          colorize(`https://linear.app/project/${opts.projectSlug}/issues`, CYAN),
      )
    }
    if (opts?.dashboardUrl) {
      lines.push(
        colorize('│ Dashboard: ', BOLD) + colorize(opts.dashboardUrl, CYAN),
      )
    }
    lines.push(formatNextRefresh(snap.polling))

    lines.push(colorize('├─ Running', BOLD))
    lines.push('│')
    lines.push(runningTableHeader(eventWidth))
    lines.push(runningTableSeparator(eventWidth))

    if (snap.running.length === 0) {
      lines.push('│  ' + colorize('No active agents', GRAY))
      lines.push('│')
    } else {
      const sorted = [...snap.running].sort((a, b) =>
        a.issueIdentifier.localeCompare(b.issueIdentifier),
      )
      for (const r of sorted) {
        lines.push(formatRunningRow(r, eventWidth))
      }
      lines.push('│')
    }

    lines.push(colorize('├─ Backoff queue', BOLD))
    lines.push('│')

    if (snap.retrying.length === 0) {
      lines.push('│  ' + colorize('No queued retries', GRAY))
    } else {
      const sorted = [...snap.retrying].sort((a, b) => a.dueAtMs - b.dueAtMs)
      for (const r of sorted) {
        lines.push(formatRetryRow(r))
      }
    }

    lines.push(closingBorder())

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

function throttledTps(now: number, currentTokens: number): number {
  const second = Math.floor(now / 1000)
  if (lastTpsSecond === second && lastTpsValue !== null) {
    return lastTpsValue
  }
  const tps = calculateTps(now, currentTokens)
  lastTpsSecond = second
  lastTpsValue = tps
  return tps
}

function calculateTps(now: number, currentTokens: number): number {
  const allSamples = [{ ts: now, tokens: currentTokens }, ...tokenSamples]
  const windowStart = now - THROUGHPUT_WINDOW_MS
  const windowed = allSamples.filter((s) => s.ts >= windowStart)

  if (windowed.length < 2) return 0

  const first = windowed[windowed.length - 1]
  const last = windowed[0]
  const elapsedMs = last.ts - first.ts
  const deltaTokens = Math.max(0, last.tokens - first.tokens)

  if (elapsedMs <= 0) return 0
  return deltaTokens / (elapsedMs / 1000)
}

function formatRunningRow(r: RunningAgentSnapshot, eventWidth: number): string {
  const issue = formatCell(r.issueIdentifier, ID_WIDTH)
  const stateDisplay = formatCell(r.state, STAGE_WIDTH)
  const session = formatCell(compactSessionId(r.sessionId), SESSION_WIDTH)
  const pid = formatCell(r.pid || 'n/a', PID_WIDTH)
  const tokens = formatCell(formatCount(r.codexTotalTokens), TOKENS_WIDTH, 'right')
  const age = formatCell(formatRuntimeAndTurns(r.runtimeSeconds, r.turnCount), AGE_WIDTH)
  const eventLabel = formatCell(humanizeMessage(r.lastCodexEvent, r.lastCodexMessage), eventWidth)
  const dotColor = eventColor(r.lastCodexEvent)

  return (
    '│ ' +
    statusDot(dotColor) +
    ' ' +
    colorize(issue, CYAN) +
    ' ' +
    colorize(stateDisplay, dotColor) +
    ' ' +
    colorize(pid, YELLOW) +
    ' ' +
    colorize(age, MAGENTA) +
    ' ' +
    colorize(tokens, YELLOW) +
    ' ' +
    colorize(session, CYAN) +
    ' ' +
    colorize(eventLabel, dotColor)
  )
}

function formatRetryRow(r: RuntimeSnapshot['retrying'][number]): string {
  const dueInMs = Math.max(r.dueAtMs - Date.now(), 0)
  const secs = Math.floor(dueInMs / 1000)
  const millis = dueInMs % 1000
  const dueStr = `${secs}.${String(millis).padStart(3, '0')}s`
  const errorStr = r.error ? formatRetryError(r.error) : ''
  return (
    '│  ' +
    colorize('\u21BB', ORANGE) +
    ' ' +
    colorize(r.identifier, RED) +
    ' ' +
    colorize(`attempt=${r.attempt}`, YELLOW) +
    colorize(' in ', DIM) +
    colorize(dueStr, CYAN) +
    errorStr
  )
}

function formatRetryError(error: string): string {
  const sanitized = error
    .replace(/\\r\\n/g, ' ')
    .replace(/\\r/g, ' ')
    .replace(/\\n/g, ' ')
    .replace(/\r\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (sanitized === '') return ''
  return ' ' + colorize(`error=${truncate(sanitized, 96)}`, DIM)
}

function runningTableHeader(eventWidth: number): string {
  const cols = [
    formatCell('ID', ID_WIDTH),
    formatCell('STAGE', STAGE_WIDTH),
    formatCell('PID', PID_WIDTH),
    formatCell('AGE / TURN', AGE_WIDTH),
    formatCell('TOKENS', TOKENS_WIDTH),
    formatCell('SESSION', SESSION_WIDTH),
    formatCell('EVENT', eventWidth),
  ]
  return '│   ' + colorize(cols.join(' '), GRAY)
}

function runningTableSeparator(eventWidth: number): string {
  const totalWidth =
    ID_WIDTH + STAGE_WIDTH + PID_WIDTH + AGE_WIDTH + TOKENS_WIDTH + SESSION_WIDTH + eventWidth + 6
  return '│   ' + colorize('\u2500'.repeat(totalWidth), GRAY)
}

function runningEventWidth(terminalCols: number): number {
  return Math.max(MIN_EVENT_WIDTH, terminalCols - fixedRunningWidth() - ROW_CHROME)
}

function fixedRunningWidth(): number {
  return ID_WIDTH + STAGE_WIDTH + PID_WIDTH + AGE_WIDTH + TOKENS_WIDTH + SESSION_WIDTH
}

function eventColor(event: string | null): string {
  if (event === null) return RED
  if (event === 'notification') return YELLOW
  if (event === 'session_started') return GREEN
  if (event === 'turn_completed') return MAGENTA
  return BLUE
}

function formatNextRefresh(polling: RuntimeSnapshot['polling']): string {
  if (!polling) {
    return colorize('│ Next refresh: ', BOLD) + colorize('n/a', GRAY)
  }
  const seconds = Math.max(Math.round(polling.nextPollInMs / 1000), 0)
  return colorize('│ Next refresh: ', BOLD) + colorize(`${seconds}s`, CYAN)
}

function formatRateLimits(rateLimits: unknown): string {
  if (rateLimits === null || rateLimits === undefined) {
    return colorize('unavailable', GRAY)
  }
  if (typeof rateLimits !== 'object') {
    return colorize(String(rateLimits), GRAY)
  }
  const rl = rateLimits as Record<string, unknown>
  const limitId = (rl.limit_id ?? rl.limitId ?? rl.limit_name ?? rl.limitName ?? 'unknown') as string
  const primary = formatRateLimitBucket(rl.primary as Record<string, unknown> | undefined)
  const secondary = formatRateLimitBucket(rl.secondary as Record<string, unknown> | undefined)
  const credits = formatRateLimitCredits(rl.credits as Record<string, unknown> | undefined)

  return (
    colorize(String(limitId), YELLOW) +
    colorize(' | ', GRAY) +
    colorize(`primary ${primary}`, CYAN) +
    colorize(' | ', GRAY) +
    colorize(`secondary ${secondary}`, CYAN) +
    colorize(' | ', GRAY) +
    colorize(credits, GREEN)
  )
}

function formatRateLimitBucket(
  bucket: Record<string, unknown> | undefined,
): string {
  if (!bucket) return 'n/a'
  const remaining = (bucket.remaining ?? bucket.remaining) as number | undefined
  const limit = (bucket.limit ?? bucket.limit) as number | undefined
  const resetValue =
    (bucket.reset_in_seconds as number | undefined) ??
    (bucket.resetInSeconds as number | undefined) ??
    (bucket.reset_at as string | undefined) ??
    (bucket.resetAt as string | undefined)

  let base: string
  if (typeof remaining === 'number' && typeof limit === 'number') {
    base = `${formatCount(remaining)}/${formatCount(limit)}`
  } else if (typeof remaining === 'number') {
    base = `remaining ${formatCount(remaining)}`
  } else if (typeof limit === 'number') {
    base = `limit ${formatCount(limit)}`
  } else if (Object.keys(bucket).length === 0) {
    base = 'n/a'
  } else {
    base = truncate(JSON.stringify(bucket), 40)
  }

  if (resetValue !== undefined) {
    const resetStr = typeof resetValue === 'number' ? `${formatCount(resetValue)}s` : String(resetValue)
    return `${base} reset ${resetStr}`
  }
  return base
}

function formatRateLimitCredits(
  credits: Record<string, unknown> | undefined,
): string {
  if (!credits) return 'credits n/a'
  const unlimited = (credits.unlimited ?? credits.unlimited) === true
  const hasCredits = (credits.has_credits ?? credits.hasCredits) === true
  const balance = (credits.balance ?? credits.balance) as number | undefined

  if (unlimited) return 'credits unlimited'
  if (hasCredits && typeof balance === 'number') return `credits ${formatCount(balance)}`
  if (hasCredits) return 'credits available'
  return 'credits none'
}

function humanizeMessage(event: string | null, message: string): string {
  if (message && message !== '') {
    return inlineText(message)
  }
  if (!event) return 'no codex message yet'

  const labels: Record<string, string> = {
    session_started: 'session started',
    startup_failed: 'startup failed',
    turn_completed: 'turn completed',
    turn_failed: 'turn failed',
    turn_cancelled: 'turn cancelled',
    turn_ended_with_error: 'turn ended with error',
    turn_input_required: 'turn blocked: waiting for user input',
    approval_auto_approved: 'approval request auto-approved',
    unsupported_tool_call: 'unsupported tool call',
    notification: 'notification',
    other_message: 'message',
    malformed: 'malformed JSON event from codex',
  }

  return labels[event] || event
}

function inlineText(text: string): string {
  return text
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function compactSessionId(id: string | null): string {
  if (!id) return 'n/a'
  if (id.length <= 10) return id
  return id.slice(0, 4) + '...' + id.slice(-6)
}

function formatCell(
  value: string,
  width: number,
  align: 'left' | 'right' = 'left',
): string {
  const cleaned = value.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
  const truncated = truncate(cleaned, width)
  if (align === 'right') return truncated.padStart(width)
  return truncated.padEnd(width)
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return value.slice(0, Math.max(0, max - 3)) + '...'
}

function formatRuntimeSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}

function formatRuntimeAndTurns(seconds: number, turnCount: number): string {
  const runtime = formatRuntimeSeconds(seconds)
  if (turnCount > 0) return `${runtime} / ${turnCount}`
  return runtime
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US')
}

function formatTps(value: number): string {
  return Math.floor(value).toLocaleString('en-US')
}

function terminalColumns(): number {
  if (typeof process.stdout.columns === 'number' && process.stdout.columns > 0) {
    return process.stdout.columns
  }
  const env = process.env['COLUMNS']
  if (env) {
    const parsed = parseInt(env, 10)
    if (!isNaN(parsed) && parsed > 0) return parsed
  }
  return 115
}

function statusDot(color: string): string {
  return colorize('\u25CF', color)
}

function closingBorder(): string {
  return '\u2570\u2500'
}

function colorize(value: string, code: string): string {
  return `${code}${value}${RESET}`
}
