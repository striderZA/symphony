import pytest
from symphony.server.app import create_app
from symphony.models import OrchestratorState, RunningEntry, Issue


@pytest.mark.asyncio
async def test_state_endpoint():
    state = OrchestratorState()
    app = create_app(orchestrator=lambda: state)
    from httpx import AsyncClient, ASGITransport
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/state")
    assert resp.status_code == 200
    data = resp.json()
    assert "counts" in data
    assert "running" in data


@pytest.mark.asyncio
async def test_issue_detail_not_found():
    state = OrchestratorState()
    app = create_app(orchestrator=lambda: state)
    from httpx import AsyncClient, ASGITransport
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/PROJ-999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_issue_detail_found():
    state = OrchestratorState()
    issue = Issue(id="1", identifier="PROJ-1", title="Fix", state="In Progress")
    state.running["1"] = RunningEntry(
        task=None, identifier="PROJ-1", issue=issue,
        session_id="thr-1-turn-1",
    )
    app = create_app(orchestrator=lambda: state)
    from httpx import AsyncClient, ASGITransport
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/v1/PROJ-1")
    assert resp.status_code == 200
    data = resp.json()
    assert data["issue_identifier"] == "PROJ-1"
    assert data["status"] == "running"


@pytest.mark.asyncio
async def test_refresh():
    refresh_called = False

    def trigger():
        nonlocal refresh_called
        refresh_called = True

    state = OrchestratorState()
    app = create_app(orchestrator=lambda: state, refresh_callback=trigger)
    from httpx import AsyncClient, ASGITransport
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/refresh")
    assert resp.status_code == 202
    data = resp.json()
    assert data["queued"] is True
    assert refresh_called is True


@pytest.mark.asyncio
async def test_dashboard():
    state = OrchestratorState()
    app = create_app(orchestrator=lambda: state)
    from httpx import AsyncClient, ASGITransport
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/")
    assert resp.status_code == 200
    assert "Symphony" in resp.text
