from typing import Any, Callable
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse
from symphony.server.router import create_router
from symphony.models import OrchestratorState


def create_app(
    orchestrator: Callable[[], OrchestratorState] | None = None,
    refresh_callback: Callable[[], None] | None = None,
    dashboard_html: str | None = None,
) -> FastAPI:
    app = FastAPI(title="Symphony", version="0.1.0")
    router = create_router(orchestrator, refresh_callback)
    app.include_router(router)

    @app.get("/", response_class=HTMLResponse)
    async def dashboard():
        if dashboard_html:
            return dashboard_html
        state = orchestrator() if orchestrator else OrchestratorState()
        running_count = len(state.running)
        retry_count = len(state.retry_attempts)
        html = f"""<!DOCTYPE html>
<html><head><title>Symphony Dashboard</title>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
</head><body>
<h1>Symphony</h1>
<p>Running: {running_count} | Retrying: {retry_count}</p>
<p><a href="/api/v1/state">JSON API →</a></p>
</body></html>"""
        return html

    @app.exception_handler(404)
    async def not_found(request, exc):
        return JSONResponse(
            status_code=404,
            content={"error": {"code": "not_found", "message": "Not found"}},
        )

    @app.exception_handler(405)
    async def method_not_allowed(request, exc):
        return JSONResponse(
            status_code=405,
            content={"error": {"code": "method_not_allowed", "message": "Method not allowed"}},
        )

    return app
