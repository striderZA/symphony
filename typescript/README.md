# Symphony TypeScript

This directory contains the TypeScript/Bun implementation of Symphony, based on
[`SPEC.md`](../SPEC.md) at the repository root.

> [!WARNING]
> Symphony TypeScript is prototype software intended for evaluation only and is presented as-is.
> We recommend implementing your own hardened version based on `SPEC.md`.

## How it works

1. Polls Linear for candidate work
2. Creates a workspace per issue
3. Launches a coding agent session inside the workspace
4. Sends a workflow prompt to the agent
5. Keeps the agent working on the issue across multiple continuation turns

During agent sessions, Symphony also serves a client-side `linear_graphql` tool so that repo
skills can make raw Linear GraphQL calls.

If a claimed issue moves to a terminal state (`Done`, `Closed`, `Cancelled`, or `Duplicate`),
Symphony stops the active agent for that issue and cleans up matching workspaces.

## How to use it

1. Make sure your codebase is set up to work well with agents.
2. Get a new personal token in Linear via Settings → Security & access → Personal API keys, and
   set it as the `LINEAR_API_KEY` environment variable.
3. Copy this directory's `WORKFLOW.md` to your repo.
4. Customize the copied `WORKFLOW.md` file for your project.
   - To get your project's slug, right-click the project and copy its URL. The slug is part of the
     URL.
5. Follow the instructions below to install the required runtime dependencies and start the service.

## Prerequisites

- [Bun](https://bun.sh/) >= 1.2

```bash
bun --version
```

## Install

```bash
cd typescript
bun install
```

## Run

```bash
git clone https://github.com/striderZA/symphony
cd symphony/typescript
bun install
bun run src/main.ts --i-understand-that-this-will-be-running-without-the-usual-guardrails ./WORKFLOW.md
```

## Configuration

Pass a custom workflow file path as an argument when starting the service:

```bash
bun run src/main.ts --i-understand-that-this-will-be-running-without-the-usual-guardrails /path/to/custom/WORKFLOW.md
```

If no path is passed, Symphony defaults to `./WORKFLOW.md`.

Optional flags:

- `--logs-root <path>` — write logs under a different directory (default: stdout)
- `--port <port>` — also starts the HTTP observability dashboard (default: disabled, enabled via `server.port` in WORKFLOW.md)
- `--i-understand-that-this-will-be-running-without-the-usual-guardrails` — required acknowledgement

The `WORKFLOW.md` file uses YAML front matter for configuration, plus a Markdown body used as the
agent session prompt.

Minimal example:

```md
---
tracker:
  kind: linear
  project_slug: "..."
workspace:
  root: ~/code/workspaces
hooks:
  after_create: |
    git clone git@github.com:your-org/your-repo.git .
agent:
  max_concurrent_agents: 10
  max_turns: 20
opencode:
  server_url: http://localhost:4096
---

You are working on a Linear issue {{ issue.identifier }}.

Title: {{ issue.title }} Body: {{ issue.description }}
```

Notes:

- If a value is missing, defaults are used.
- Safer OpenCode defaults are used when policy fields are omitted.
- `agent.max_turns` caps how many back-to-back agent turns Symphony will run in a single agent
  invocation when a turn completes normally but the issue is still in an active state. Default: `20`.
- If the Markdown body is blank, Symphony uses a default prompt template that includes the issue
  identifier, title, and body.
- Use `hooks.after_create` to bootstrap a fresh workspace. For a Git-backed repo, you can run
  `git clone ... .` there, along with any other setup commands you need.
- `tracker.api_key` reads from `LINEAR_API_KEY` when unset or when value is `$LINEAR_API_KEY`.
- For path values, `~` is expanded to the home directory.
- `server.port` or CLI `--port` enables the optional HTTP dashboard and JSON API at
  `/` and `/api/v1/state`.
- If `WORKFLOW.md` is missing or has invalid YAML at startup, Symphony does not boot.
- If a later reload fails, Symphony keeps running with the last known good workflow and logs the
  reload error until the file is fixed.

## Web dashboard

The observability UI runs on Bun's built-in HTTP server:

- HTML dashboard at `/` with running sessions, retry queue, token usage, and runtime totals
- JSON API for operational debugging at `/api/v1/state`

## Project Layout

- `src/`: application source code
  - `server/`: HTTP dashboard and JSON API
  - `tracker/`: Linear and memory tracker adapters
- `tests/`: vitest coverage for runtime behavior
- `WORKFLOW.md`: in-repo workflow contract used by local runs

## Testing

```bash
cd typescript
npx vitest run
```

## FAQ

### Why TypeScript?

TypeScript with Bun provides fast startup, excellent async/await ergonomics, a rich type system
for config validation (Zod), and the ability to leverage the JavaScript ecosystem. Bun's built-in
test runner and HTTP server mean minimal external dependencies.

### What's the easiest way to set this up for my own codebase?

Launch a coding agent in your repo, give it the URL to the Symphony repo, and ask it to set things
up for you.

## License

This project is licensed under the [Apache License 2.0](../LICENSE).
