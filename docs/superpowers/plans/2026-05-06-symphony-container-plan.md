# Symphony + OpenCode Container Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Containerize Symphony and OpenCode server into a single Podman container for consistent Linux environment on Windows/WSL.

**Architecture:** Single ubuntu:24.04 container with both processes: `opencode serve` runs in background, Symphony runs in foreground. Volumes mount source code, workspace root, SSH keys, and gitconfig from WSL.

**Tech Stack:** Ubuntu 24.04, Bun, Node.js (for opencode-ai), bash, Podman

---

### Task 1: Create Containerfile

**Files:**
- Create: `Containerfile`
- Verify build: `podman build -t symphony .`

- [ ] **Step 1: Write Containerfile**

```containerfile
FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
    curl ca-certificates git openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Install opencode
RUN npm install -g opencode-ai

WORKDIR /app

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4096

ENTRYPOINT ["/entrypoint.sh"]
```

- [ ] **Step 2: Create empty entrypoint.sh placeholder for now**

```bash
#!/usr/bin/env bash
echo "entrypoint.sh not yet implemented"
```

- [ ] **Step 3: Verify build succeeds**

Run: `podman build -t symphony .`
Expected: Build completes with "Successfully tagged symphony:latest"

- [ ] **Step 4: Commit**

```bash
git add Containerfile entrypoint.sh
git commit -m "feat: add Containerfile and entrypoint placeholder"
```

---

### Task 2: Write entrypoint.sh

**Files:**
- Modify: `entrypoint.sh`

- [ ] **Step 1: Write entrypoint script**

```bash
#!/usr/bin/env bash
set -e

PORT="${OPENCODE_PORT:-4096}"

# Start opencode server in background
echo "Starting opencode server on port ${PORT}..."
opencode serve --port "${PORT}" &
OPENCODE_PID=$!

# Poll for readiness
echo "Waiting for opencode server..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${PORT}/global/health" > /dev/null 2>&1; then
    echo "opencode server ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "opencode server failed to start"
    kill "${OPENCODE_PID}" 2>/dev/null
    exit 1
  fi
  sleep 1
done

# Cleanup handler
cleanup() {
  echo "Shutting down..."
  kill "${OPENCODE_PID}" 2>/dev/null
  wait "${OPENCODE_PID}" 2>/dev/null
  exit 0
}
trap cleanup SIGTERM SIGINT

# Start Symphony
WORKFLOW_PATH="${WORKFLOW_PATH:-/app/WORKFLOW.md}"
echo "Starting Symphony with ${WORKFLOW_PATH}..."
exec bun run /app/src/main.ts "${WORKFLOW_PATH}"
```

- [ ] **Step 2: Verify shell syntax**

Run: `bash -n entrypoint.sh`
Expected: No output (syntax OK)

- [ ] **Step 3: Commit**

```bash
git add entrypoint.sh
git commit -m "feat: entrypoint starts opencode + Symphony with health check"
```

---

### Task 3: Update WORKFLOW.md.example for container

**Files:**
- Modify: `WORKFLOW.md.example`

- [ ] **Step 1: Update workspace root to /workspaces**

Change `workspace.root` to `/workspaces` in WORKFLOW.md.example so it matches the container volume mount:

```yaml
workspace:
  root: /workspaces
```

Also update the `after_create` hook — the indentation in the current example uses inconsistent spacing. Fix to use consistent indentation:

```yaml
hooks:
  after_create: |
    export GIT_TERMINAL_PROMPT=0
    git clone git@github.com:your-org/your-repo.git .
    git checkout main
```

(Remove leading spaces before git commands — bash handles indentation fine, but consistent formatting avoids confusion.)

- [ ] **Step 2: Commit**

```bash
git add WORKFLOW.md.example
git commit -m "fix: WORKFLOW.md.example uses /workspaces root, consistent indentation"
```

---

### Task 4: Build and smoke-test the container

**Files:** (none)

- [ ] **Step 1: Build the container**

Run: `podman build -t symphony .`
Expected: Successfully tagged

- [ ] **Step 2: Run container and verify opencode health**

```bash
podman run -d --name symphony-test -p 4096:4096 symphony
sleep 5
curl -sf http://localhost:4096/global/health
```

Expected: JSON response `{ "healthy": true, "version": "..." }`

- [ ] **Step 3: Check Symphony logs**

```bash
podman logs symphony-test
```

Expected: Lines including "symphony_starting", "symphony_config_loaded" (will fail to find WORKFLOW.md since we didn't mount it — that's expected)

- [ ] **Step 4: Clean up test container**

```bash
podman stop symphony-test
podman rm symphony-test
```

- [ ] **Step 5: Commit any final adjustments**

```bash
git add -A
git commit -m "fix: container build and smoke test adjustments"
```
