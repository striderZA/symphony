---
tracker:
  kind: linear
  project_slug: "rf-simulator-tools-aa76702d51f2"
  api_key: $LINEAR_API_KEY
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Closed
    - Cancelled
    - Canceled
    - Duplicate
    - Done
polling:
  interval_ms: 5000
workspace:
  root: ~/code/symphony-workspaces
hooks:
  after_create: |
    git clone --depth 1 git@github.com:striderZA/Tiny-RF-Simulator.git
    if command -v bun >/dev/null 2>&1; then
      cd typescript && bun install
    fi
agent:
  max_concurrent_agents: 10
  max_turns: 20
opencode:
  server_url: http://localhost:4096
  stall_timeout_ms: 300000
  session_timeout_ms: 3600000
server:
  port: 8080
  host: 127.0.0.1
---

You are working on a Linear ticket `{{ issue.identifier }}`

{% if attempt %}
Continuation context:

- This is retry attempt #{{ attempt }} because the ticket is still in an active state.
- Resume from the current workspace state instead of restarting from scratch.
- Do not repeat already-completed investigation or validation unless needed for new code changes.
- Do not end the turn while the issue remains in an active state unless you are blocked by missing required permissions/secrets.
{% endif %}

Issue context:
Identifier: {{ issue.identifier }}
Title: {{ issue.title }}
Current status: {{ issue.state }}
Labels: {{ issue.labels }}
URL: {{ issue.url }}

Description:
{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

Instructions:

1. This is an unattended orchestration session. Never ask a human to perform follow-up actions.
2. Only stop early for a true blocker (missing required auth/permissions/secrets). If blocked, record it in a Linear comment and move the issue according to workflow.
3. Final message must report completed actions and blockers only. Do not include "next steps for user".
4. Work only in the provided workspace directory. Do not touch any other path.

## Available tools and skills

- `linear_graphql` tool: interact with Linear (read/fetch issues, update state, manage comments)
- `.opencode/skills/commit/SKILL.md`: produce clean, logical commits.
- `.opencode/skills/push/SKILL.md`: push branch and create/update PR.
- `.opencode/skills/pull/SKILL.md`: sync with latest origin/main.
- `.opencode/skills/land/SKILL.md`: merge PR (land loop).
- `.opencode/skills/linear/SKILL.md`: Linear interaction details.
- OpenCode `skill` tool: to load the above skills by name when needed.

## Status map

- `Todo` -> queued; immediately transition to `In Progress` before active work.
- `In Progress` -> implementation actively underway.
- `In Review` (or `Human Review`) -> PR is attached; waiting on human approval.
- `Done` -> terminal; no further action.

## Step 0: Determine current ticket state and route

1. Read the current issue state.
2. Route to the matching flow:
   - `Todo` -> move to `In Progress`, then start execution flow.
   - `In Progress` -> continue from current state.
   - `In Review` / `Human Review` -> wait and poll for decision.
   - `Done` -> do nothing and shut down.

## Step 1: Execution phase (Todo -> In Progress -> In Review)

1. If current state is `Todo`, move it to `In Progress` via `linear_graphql` tool.
2. Determine current workspace state: branch, git status, HEAD.
3. Start work with a plan:
   - Understand the issue requirements.
   - Break work into tasks, each with a verification step.
   - Work through tasks: implement, test, commit.
4. Before pushing, sync with latest `origin/main` and resolve conflicts.
5. Run required validation (tests, etc.) and confirm it passes.
6. Create a PR via the `push` skill.
7. Run the full test suite one final time.
8. Attach PR URL to the issue.
9. Update the Linear issue to `In Review`.
10. The orchestrator will detect completion and clean up.

## Step 2: Rework handling

If the issue comes back with review feedback:

1. Re-read the full issue and comments.
2. Address feedback in the existing branch.
3. Push updates.
4. Move issue back to `In Review`.

## Guardrails

- Do not ask a human for help unless truly blocked by missing auth/tools.
- If blocked, record the blocker in a Linear comment with what is missing and what action is needed.
- Only move to `In Review` when all tasks are complete, tests pass, and a PR is attached.
- If the workspace state is inconsistent (dirty tree, failing tests), do not move to `In Review`.

## Related skills

- `linear` / `linear_graphql`: interact with Linear.
- `commit`: produce clean commits.
- `push`: create/update PR.
- `pull`: sync with origin/main.
- `land`: merge approved PR.
