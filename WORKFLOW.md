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
  server_start_command: opencode app-server --port 4096
  stall_timeout_ms: 300000
  session_timeout_ms: 3600000
server:
  port: 8080
  host: 127.0.0.1
---

You are working on a Linear ticket `{{ issue.identifier }}`.

## Issue context

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

{% if attempt %}
This is continuation run #{{ attempt }}. Resume from the current workspace state instead of restarting from scratch.
{% endif %}

## Available superpowers skills

This environment has the superpowers plugin loaded. The following skills are available
via the `skill` tool and should be used at the appropriate phases:

- `superpowers:test-driven-development` — write tests before implementation
- `superpowers:dispatching-parallel-agents` — run independent tasks in parallel subagents
- `superpowers:requesting-code-review` — structured self-review checklist
- `superpowers:finishing-a-development-branch` — final validation before completion

Use the `skill` tool to load these when needed.

## Workspace conventions

A workspace has been created for this ticket at the configured workspace root.
Your current working directory is the workspace.

Check if `AGENTS.md` exists in the workspace root. If it does, read it — it contains
project-specific conventions (git practices, coding style, test framework, branch
naming). If it doesn't exist, create one with the relevant conventions based on the
code you find in the workspace so that subsequent work in this repository has
consistent guidance.

## Workflow

Follow this workflow for every issue. Each phase has a self-verification gate —
verify quality before proceeding to the next phase.

### Phase 1: Analyze

- Load `superpowers:brainstorming` to ensure you explore the requirements thoroughly.
  Since there is no human to interact with, the skill's exploration guides you through
  understanding the issue independently — use it to check for hidden assumptions.
- Read the issue description and any linked resources.
- Identify the files, patterns, and areas that will be affected.

**Gate:** Can you clearly state what needs to be built and what the acceptance criteria
are? If not, re-read the issue. If yes, save a brief analysis to `ANALYSIS.md` in the
workspace and proceed.

### Phase 2: Plan

- Load `superpowers:writing-plans` to create a structured implementation plan.
- Break the work into tasks. Each task should produce a working, testable change.
- For each task, specify: what files to change, what the change does, and how to verify it.
- **Subagent opportunity**: If two or more tasks have no shared state or sequential
  dependency, note them as parallelizable. These will be dispatched to subagents in
  Phase 3.
- Check for or create `AGENTS.md` in the workspace root with git conventions
  (branch naming, commit message format, squash policy, etc.).
- Save the plan as `PLAN.md` in the workspace.

**Gate:** Does every task have a clear verification step? Can independent tasks be
parallelized? If you can't verify a task, add a test step. When the plan is solid, proceed.

### Phase 3: Implement (Test-Driven)

Load `superpowers:test-driven-development` for the implementation approach and
`superpowers:dispatching-parallel-agents` when you have 2+ independent tasks.

For each task from the plan:

1. **Write the failing test** — before touching implementation, write a test that
   captures the expected behavior. Use the project's existing test framework and
   conventions.
2. **Run the test** — confirm it fails with the expected error.
3. **Implement** — write the minimal code to make the test pass. Do not add features
   beyond what the test requires (YAGNI).
4. **Run the test** — confirm it passes.
5. **Commit** with a descriptive message: `task N: short description`.
6. Run the full test suite to check for regressions before moving to the next task.

**Parallel execution:** When tasks are independent (no shared state, no sequential
dependency), dispatch them to subagents using the `Task` tool or follow the
`superpowers:dispatching-parallel-agents` skill. Each subagent gets one task with
the workspace path, the task description, and the relevant conventions from
AGENTS.md. Collect results before proceeding to the next phase.

**Gate:** Are all tests passing? Does each task's commit contain only the changes
needed for that task? If a task introduced unrelated changes, revert them. When all
tasks are done, proceed.

### Phase 4: Review

Load `superpowers:requesting-code-review` for a structured review checklist.

- Review every file that was changed. Are the changes correct, complete, and clean?
- Check edge cases: empty states, errors, boundaries.
- Verify test coverage: are there tests for happy path, error cases, and edge cases?
- Run the full test suite one final time.

**Gate:** Would you approve this code if someone else wrote it? If there are TODOs,
commented-out code, or unclear names, fix them now. If the test suite passes and the
code is clean, proceed.

### Phase 5: Finish

Load `superpowers:finishing-a-development-branch` for the completion checklist.

- Confirm the workspace state is clean (`git status`, `git log`).
- All test suites should pass.
- The workspace should be in a consistent state with all changes committed.

**You have no further actions.** The orchestrator will handle the Linear state transition
to "In Review".
