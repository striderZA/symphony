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
