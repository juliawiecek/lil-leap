#!/bin/sh
# Run checks with the same toolchain on every Linux Jenkins agent, using Docker CLI.
set -eu

ci_workspace=${WORKSPACE:-$(pwd)}
case "${1:-}" in
  backend)
    ci_image=maven:3.9-eclipse-temurin-21
    ci_component=backend
    rm -f "$ci_workspace/backend/target/surefire-reports"/TEST-*.xml
    set -- mvn -B -ntp -Duser.home=/tmp -Dmaven.repo.local=/tmp/maven-repository clean verify
    ;;
  frontend)
    ci_image=node:24-bookworm-slim
    ci_component=frontend
    rm -f "$ci_workspace/frontend/test-results/security.xml"
    set -- sh -ec 'npm ci; npm run test:ci; npm run build'
    ;;
  *)
    echo 'Usage: sh ci/run-checks.sh backend|frontend' >&2
    exit 2
    ;;
esac

# Keep only this invocation's container ID; cleanup must never target another build.
ci_state=$(mktemp -d)
cleanup() {
  if [ -s "$ci_state/container-id" ]; then
    docker rm -f "$(cat "$ci_state/container-id")" >/dev/null 2>&1 || true
  fi
  rm -f "$ci_state/container-id"
  rmdir "$ci_state"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

# Running as the Jenkins UID avoids root-owned reports/node_modules in its workspace.
# Mount only the component, so repository-level .env files are not exposed to tests.
docker run --rm --init --cidfile "$ci_state/container-id" \
  --user "$(id -u):$(id -g)" \
  --volume "$ci_workspace/$ci_component:/workspace" \
  --workdir /workspace \
  --env CI=true \
  --env MAVEN_CONFIG=/tmp/maven-config \
  --env npm_config_cache=/tmp/npm-cache \
  "$ci_image" "$@"
