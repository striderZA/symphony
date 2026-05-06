from typing import Any, Callable
from fastapi import APIRouter, HTTPException
from symphony.models import OrchestratorState
from symphony.status import build_status_snapshot


def create_router(
    get_state: Callable[[], OrchestratorState] | None = None,
    refresh_callback: Callable[[], None] | None = None,
) -> APIRouter:
    router = APIRouter(prefix="/api/v1")

    @router.get("/state")
    async def get_state_endpoint():
        state = get_state() if get_state else OrchestratorState()
        return build_status_snapshot(state)

    @router.get("/{issue_identifier}")
    async def get_issue_detail(issue_identifier: str):
        if not get_state:
            raise HTTPException(status_code=404, detail="Orchestrator not available")
        state = get_state()
        for issue_id, entry in state.running.items():
            if entry.identifier == issue_identifier:
                return {
                    "issue_identifier": entry.identifier,
                    "issue_id": issue_id,
                    "status": "running",
                    "workspace": {"path": ""},
                    "running": {
                        "session_id": entry.session_id,
                        "state": entry.issue.state,
                        "started_at": entry.started_at.isoformat() if entry.started_at else None,
                        "last_event": entry.last_codex_event,
                        "last_message": entry.last_codex_message,
                        "last_event_at": entry.last_codex_timestamp.isoformat() if entry.last_codex_timestamp else None,
                        "tokens": {
                            "input_tokens": entry.codex_input_tokens,
                            "output_tokens": entry.codex_output_tokens,
                            "total_tokens": entry.codex_total_tokens,
                        },
                    },
                    "retry": None,
                    "last_error": None,
                }
        for issue_id, entry in state.retry_attempts.items():
            if entry.identifier == issue_identifier:
                return {
                    "issue_identifier": entry.identifier,
                    "issue_id": issue_id,
                    "status": "retrying",
                    "retry": {
                        "attempt": entry.attempt,
                        "error": entry.error,
                    },
                }
        raise HTTPException(status_code=404, detail=f"Issue {issue_identifier} not found")

    @router.post("/refresh", status_code=202)
    async def refresh():
        if refresh_callback:
            refresh_callback()
        return {
            "queued": True,
            "coalesced": False,
            "operations": ["poll", "reconcile"],
        }

    return router
