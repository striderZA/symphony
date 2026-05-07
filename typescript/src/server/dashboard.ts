import type { ApiStateResponse } from './api'

export function renderDashboard(state: ApiStateResponse): string {
  const runningRows = state.running.map((r) => `
    <tr>
      <td>${esc(r.issue_identifier)}</td>
      <td>${esc(r.state)}</td>
      <td>${r.turn_count}</td>
      <td>${esc(r.session_id ?? '-')}</td>
      <td>${esc(r.last_event ?? '-')}</td>
    </tr>`).join('')

  const retryRows = state.retrying.map((r) => `
    <tr>
      <td>${esc(r.identifier)}</td>
      <td>${r.attempt}</td>
      <td>${esc(r.error ?? '-')}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Symphony Dashboard</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 0 auto; padding: 1rem; }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
  th, td { padding: 0.5rem; text-align: left; border-bottom: 1px solid #ddd; }
  th { background: #f5f5f5; }
  .counts { display: flex; gap: 1rem; margin: 1rem 0; flex-wrap: wrap; }
  .count-card { padding: 1rem; border: 1px solid #ddd; border-radius: 6px; min-width: 120px; }
  .count-number { font-size: 1.5rem; font-weight: bold; margin-top: 0.25rem; }
  h1 { margin-bottom: 0; }
  .generated { color: #666; font-size: 0.85rem; }
</style></head>
<body>
  <h1> Symphony</h1>
  <p class="generated">Generated at ${state.generated_at}</p>
  <div class="counts">
    <div class="count-card"><div>Running</div><div class="count-number">${state.counts.running}</div></div>
    <div class="count-card"><div>Retrying</div><div class="count-number">${state.counts.retrying}</div></div>
    <div class="count-card"><div>Tokens</div><div class="count-number">${state.codex_totals.total_tokens}</div></div>
    <div class="count-card"><div>Runtime</div><div class="count-number">${Math.round(state.codex_totals.seconds_running)}s</div></div>
  </div>
  <h2>Running</h2>
  <table><thead><tr><th>Issue</th><th>State</th><th>Turns</th><th>Session</th><th>Last Event</th></tr></thead>
  <tbody>${runningRows || '<tr><td colspan="5">No running sessions</td></tr>'}</tbody></table>
  <h2>Retrying</h2>
  <table><thead><tr><th>Issue</th><th>Attempt</th><th>Error</th></tr></thead>
  <tbody>${retryRows || '<tr><td colspan="3">No retries queued</td></tr>'}</tbody></table>
  <h2>Totals</h2>
  <p>Input: ${state.codex_totals.input_tokens} | Output: ${state.codex_totals.output_tokens} | Total: ${state.codex_totals.total_tokens} | Runtime: ${Math.round(state.codex_totals.seconds_running)}s</p>
</body></html>`
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
