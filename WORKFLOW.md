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

## Workflow

Follow this workflow for every issue. Each phase has a self-verification gate — verify quality before proceeding to the next phase.

### Phase 1: Analyze

- Read the issue description and any linked resources
- Understand what needs to change and why
- Identify the files, patterns, and areas that will be affected

**Gate:** Can you clearly state what needs to be built and what the acceptance criteria are? If not, re-read the issue. If yes, save a brief analysis to `ANALYSIS.md` in the workspace and proceed.

### Phase 2: Plan

- Break the work into tasks. Each task should produce a working, testable change.
- For each task, specify: what files to change, what the change does, and how to verify it.
- Save the plan as `PLAN.md` in the workspace.

**Gate:** Does every task have a clear verification step? Can each task be completed independently? If a task spans multiple concerns, split it. If you can't verify a task, add a test step. When the plan is solid, proceed.

### Phase 3: Implement (Test-Driven)

For each task from the plan:

1. **Write the failing test** — before touching implementation, write a test that captures the expected behavior. Use the project's existing test framework and conventions.
2. **Run the test** — confirm it fails with the expected error (proves the test is valid).
3. **Implement** — write the minimal code to make the test pass. Do not add features beyond what the test requires (YAGNI).
4. **Run the test** — confirm it passes.
5. **Commit** with a descriptive message: `task N: short description`.
6. Run the full test suite to check for regressions before moving to the next task.

**Gate:** Are all tests passing? Does each task's commit contain only the changes needed for that task? If a task introduced unrelated changes, revert them. When all tasks are done, proceed.

### Phase 4: Review

- Review every file that was changed. Are the changes correct, complete, and clean?
- Check edge cases: empty states, errors, boundaries.
- Verify test coverage: are there tests for happy path, error cases, and edge cases?
- Run the full test suite one final time.

**Gate:** Would you approve this code if someone else wrote it? If there are TODOs, commented-out code, or unclear names, fix them now. If the test suite passes and the code is clean, proceed.

### Phase 5: Finish

When you reach this phase, the work is complete. Do one final `git status` and `git log` to confirm the workspace state is clean. All test suites should pass.

**You have no further actions.** The orchestrator will handle the Linear state transition.
