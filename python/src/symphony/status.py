from datetime import datetime, timezone
from typing import Any

from symphony.models import OrchestratorState


def build_status_snapshot(state: OrchestratorState) -> dict[str, Any]:
    """Build a status snapshot from orchestrator state (§13.3, §13.7.2)."""
    running_rows = []
    for issue_id, entry in state.running.items():
        row = {
            "issue_id": issue_id,
            "issue_identifier": entry.identifier,
            "state": entry.issue.state,
            "session_id": entry.session_id,
            "last_event": entry.last_codex_event,
            "last_message": entry.last_codex_message,
            "started_at": entry.started_at.isoformat() if entry.started_at else None,
            "last_event_at": entry.last_codex_timestamp.isoformat() if entry.last_codex_timestamp else None,
            "tokens": {
                "input_tokens": entry.codex_input_tokens,
                "output_tokens": entry.codex_output_tokens,
                "total_tokens": entry.codex_total_tokens,
            },
        }
        running_rows.append(row)

    retry_rows = []
    for issue_id, entry in state.retry_attempts.items():
        due_dt = datetime.fromtimestamp(entry.due_at_ms / 1000.0, tz=timezone.utc)
        row = {
            "issue_id": issue_id,
            "issue_identifier": entry.identifier,
            "attempt": entry.attempt,
            "due_at": due_dt.isoformat(),
            "error": entry.error,
        }
        retry_rows.append(row)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "counts": {
            "running": len(running_rows),
            "retrying": len(retry_rows),
        },
        "running": running_rows,
        "retrying": retry_rows,
        "codex_totals": {
            "input_tokens": state.codex_totals.input_tokens,
            "output_tokens": state.codex_totals.output_tokens,
            "total_tokens": state.codex_totals.total_tokens,
            "seconds_running": state.codex_totals.seconds_running,
        },
        "rate_limits": state.codex_rate_limits,
    }
