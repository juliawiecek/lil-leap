#!/usr/bin/env bash
# Jenkins needs Docker Compose v2; Node 24 comes from the same image as frontend tests.
set -euo pipefail
mkdir -p e2e/artifacts
if command -v node >/dev/null 2>&1 && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  node e2e/run-stack.mjs --smoke
else
  # Compose bind mounts resolve on the host, so preserve the workspace path.
  docker run --rm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$WORKSPACE:$WORKSPACE" -w "$WORKSPACE" \
    -e E2E_RUNNER_UID="$(id -u)" -e E2E_RUNNER_GID="$(id -g)" \
    node:24-alpine sh -ec 'apk add --no-cache docker-cli docker-cli-compose; node e2e/run-stack.mjs --smoke'
fi
