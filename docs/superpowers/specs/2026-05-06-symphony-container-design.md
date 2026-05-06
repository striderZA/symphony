# Symphony + OpenCode Container Design

## Goal
Package Symphony and the OpenCode HTTP server into a single Podman container so both run in a consistent Linux environment, eliminating Windows/bash/SSH/env portability issues.

## Container Image

**Base:** `ubuntu:24.04`

**Installed packages:**
- `bun` (official install script)
- `opencode-ai` (npm global)
- `git`, `openssh-client`
- `curl`, `ca-certificates`

## Entrypoint

A single script (`entrypoint.sh`) does:

1. Start `opencode serve --port 4096` in background
2. Poll `http://localhost:4096/global/health` until ready
3. Run `bun run /app/src/main.ts "${WORKFLOW_PATH:-/app/WORKFLOW.md}"` (Symphony foreground)
4. On SIGTERM/SIGINT, kill background opencode before exit

## Volume Mounts

All mounts are from the WSL2 Linux filesystem into the container:

| Host (WSL) path | Container path | Purpose |
|---|---|---|
| `/workspaces` | `/workspaces` | Per-issue git clones — must match `workspace.root` in WORKFLOW.md (set to `/workspaces`) |
| `~/symphony/WORKFLOW.md` | `/app/WORKFLOW.md` | Workflow config with hooks |
| `~/symphony/src/` | `/app/src/` | Symphony TypeScript source (hot-reload via bun) |
| `~/.ssh/` | `/root/.ssh/` | SSH keys for git clone |
| `~/.gitconfig` | `/root/.gitconfig` | Git identity |

## Build

```dockerfile
FROM ubuntu:24.04

RUN apt-get update && apt-get install -y \
    curl unzip git openssh-client ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Install opencode
RUN npm install -g opencode-ai

WORKDIR /app

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
```

## Run

```bash
podman build -t symphony .
podman run -d \
  --name symphony \
  -v /workspaces:/workspaces \
  -v ~/symphony/WORKFLOW.md:/app/WORKFLOW.md \
  -v ~/symphony/src:/app/src \
  -v ~/.ssh:/root/.ssh:ro \
  -v ~/.gitconfig:/root/.gitconfig:ro \
  -p 4096:4096 \
  symphony
```

## Prerequisites (one-time)

1. Install Podman Desktop (includes WSL2 backend)
2. Copy SSH keys into WSL:
   ```bash
   cp /mnt/c/Users/<you>/.ssh/id_* ~/.ssh/
   chmod 600 ~/.ssh/id_*
   ```
3. Create workspace root:
   ```bash
   mkdir -p /workspaces
   ```

## What This Fixes

- **`export` not recognized** — container runs Linux natively, `export` works
- **WSL bash vs Git bash** — one consistent bash
- **SSH agent forwarding** — `~/.ssh` mounted directly
- **OpenCode server path mismatch** — OpenCode project dir is the container's `/app`, no workspace confusion

## What's Not In Scope

- Multi-arch images (x86 only)
- CI/CD pipeline
- Docker Compose (unnecessary for single-container setup)
- Health monitoring/restart policy

## Future Options

- Switch to `--init` flag for proper PID 1 signal handling
- Add HEALTHCHECK against OpenCode `/global/health`
- Compose file if monitoring or DB containers are added later
