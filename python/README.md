# Symphony Python

This directory contains a [Python](https://python.org) implementation of Symphony, based on
[`SPEC.md`](../SPEC.md) at the repository root.

> [!WARNING]
> Prototype software intended for evaluation. Not hardened for production use.

## How it works

1. Polls Linear for candidate work.
2. Creates a workspace per issue.
3. Launches Codex in [App Server mode](https://developers.openai.com/codex/app-server/) inside the
   workspace.
4. Sends a workflow prompt to Codex.
5. Keeps Codex working on the issue until the work is done.

During app-server sessions, Symphony also serves a client-side `linear_graphql` tool so that repo
skills can make raw Linear GraphQL calls.

If a claimed issue moves to a terminal state (`Done`, `Closed`, `Cancelled`, or `Duplicate`),
Symphony stops the active agent for that issue and cleans up matching workspaces.

## How to use it

1. Make sure your codebase is set up to work well with agents: see
   [Harness engineering](https://openai.com/index/harness-engineering/).
2. Get a new personal token in Linear via Settings → Security & access → Personal API keys, and
   set it as the `LINEAR_API_KEY` environment variable.
3. Create a `WORKFLOW.md` in your repo (see example below).
4. Customize the workflow file for your project:
   - `tracker.project_slug` — your Linear project slug (from the project URL).
   - `workspace.root` — where per-issue workspaces are created.
   - `hooks.after_create` — optional script to bootstrap new workspaces (e.g., `git clone`).
5. Install dependencies and start the service.

## Prerequisites

- Python 3.12+
- [Codex CLI](https://codex.cli/) for agent execution

## Install

```bash
cd python
pip install -e ".[server]"   # include --port support for the HTTP dashboard
```

## Run

```bash
cd python
python -m symphony /path/to/WORKFLOW.md --port 8080
```

If no workflow path is given, defaults to `./WORKFLOW.md`. Optional flags:

- `--port` — enables the FastAPI dashboard and JSON API on that port.
- `--logs-root` — directory for log files (default: `./log`).

## Configuration

Symphony is configured through a `WORKFLOW.md` file with YAML front matter and a Markdown prompt
body. Example:

```markdown
---
tracker:
  kind: linear
  project_slug: my-project
workspace:
  root: ~/symphony_workspaces
hooks:
  after_create: |
    git clone git@github.com:my-org/my-repo.git .
agent:
  max_concurrent_agents: 5
  max_turns: 20
codex:
  command: codex app-server
---

You are working on {{ issue.identifier }}: {{ issue.title }}.
```

## Project Layout

```
python/
├── pyproject.toml
├── src/symphony/
│   ├── __main__.py          # CLI entry point
│   ├── cli.py               # Argument parsing
│   ├── models.py            # Domain models (Issue, Workspace, OrchestratorState)
│   ├── config.py            # Typed config with defaults + $VAR resolution
│   ├── workflow.py          # WORKFLOW.md loader
│   ├── workflow_store.py    # File watching and reload
│   ├── orchestrator.py      # Poll loop, dispatch, retry, reconciliation
│   ├── workspace.py         # Per-issue workspace lifecycle and hooks
│   ├── agent_runner.py      # Codex app-server subprocess client
│   ├── prompt_builder.py    # Jinja2 strict template rendering
│   ├── path_safety.py       # Path sanitization and containment
│   ├── hooks.py             # Shell hook execution with timeout
│   ├── log.py               # Structured logging (structlog)
│   ├── status.py            # Runtime snapshot builder
│   ├── exceptions.py        # All error classes
│   ├── tracker/
│   │   ├── base.py          # Abstract tracker adapter
│   │   ├── linear.py        # Linear GraphQL client
│   │   └── memory.py        # In-memory tracker for testing
│   └── server/
│       ├── app.py           # FastAPI app
│       └── router.py        # /api/v1/* endpoints
└── tests/                   # 100+ tests
```

## Testing

```bash
cd python
python -m pytest tests/ -v
```

## Web Dashboard

Start with `--port` to enable the HTTP server:

```
python -m symphony WORKFLOW.md --port 8080
```

- `GET /` — HTML dashboard showing running/retrying sessions and aggregate metrics.
- `GET /api/v1/state` — JSON snapshot of current system state.
- `GET /api/v1/<issue_identifier>` — Per-issue debug details.
- `POST /api/v1/refresh` — Trigger an immediate poll cycle.

## License

Apache License 2.0 — see [LICENSE](../LICENSE).
