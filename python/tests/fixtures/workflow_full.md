---
tracker:
  kind: linear
  project_slug: my-project
  api_key: $LINEAR_API_KEY
  active_states:
    - Todo
    - In Progress
  terminal_states:
    - Done
    - Cancelled
polling:
  interval_ms: 15000
workspace:
  root: ~/symphony_ws
hooks:
  after_create: |
    echo "created"
  before_run: |
    echo "before"
  after_run: |
    echo "after"
agent:
  max_concurrent_agents: 5
  max_turns: 10
codex:
  command: codex app-server
  turn_timeout_ms: 7200000
---
You are working on {{ issue.identifier }}: {{ issue.title }}.
Attempt: {{ attempt }}
