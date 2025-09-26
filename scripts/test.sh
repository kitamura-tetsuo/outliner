#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLIENT_DIR="${ROOT_DIR}/client"
SERVER_DIR="${ROOT_DIR}/server"
ENV_TEST_DIR="${ROOT_DIR}/scripts/tests"

print_usage() {
    cat <<USAGE
Usage: $0 [test-target]

Run the full test suite or a specific test target.

Targets:
  unit             Run client unit tests (vitest unit project)
  integration      Run client integration tests (vitest integration project)
  production       Run client production tests (vitest production project)
  e2e              Run all client Playwright tests
  server           Run server mocha tests
  env              Run environment (ENV-*) vitest suite
  <path>           Run a specific test file. Paths within client/e2e/ use Playwright,
                   paths within scripts/tests/ use Vitest, and server/tests/ use Mocha.

Examples:
  $0                     # run the entire suite sequentially
  $0 unit                # run client unit tests
  $0 client/e2e/core/outliner-basic.spec.ts
  $0 scripts/tests/env-setup-script-starts-all-services-95e7c1a6.spec.ts
USAGE
}

run_client_unit_tests() {
    echo "=== Running client unit tests ==="
    (cd "$CLIENT_DIR" && npm run test:unit)
}

run_client_integration_tests() {
    echo "=== Running client integration tests ==="
    (cd "$CLIENT_DIR" && npm run test:integration)
}

run_client_production_tests() {
    echo "=== Running client production tests ==="
    (cd "$CLIENT_DIR" && npm run test:production)
}

run_client_e2e_tests() {
    echo "=== Running client E2E tests ==="
    (cd "$CLIENT_DIR" && npm run test:e2e)
}

run_client_e2e_spec() {
    local absolute_path="$1"
    local relative_path
    relative_path=$(python3 - <<PY
import os
print(os.path.relpath(${absolute_path@Q}, ${CLIENT_DIR@Q}))
PY
)
    echo "=== Running Playwright spec: ${relative_path} ==="
    (cd "$CLIENT_DIR" && npm run test:e2e -- "$relative_path")
}

run_server_tests() {
    if [ ! -d "$SERVER_DIR" ]; then
        echo "Server directory not found. Skipping server tests." >&2
        return 0
    fi
    echo "=== Running server tests ==="
    (cd "$SERVER_DIR" && npx mocha tests/**/*.test.js --timeout 10000)
}

run_server_test_file() {
    local absolute_path="$1"
    local relative_path
    relative_path=$(python3 - <<PY
import os
print(os.path.relpath(${absolute_path@Q}, ${SERVER_DIR@Q}))
PY
)
    echo "=== Running server test: ${relative_path} ==="
    (cd "$SERVER_DIR" && npx mocha "$relative_path" --timeout 10000)
}

run_env_tests() {
    echo "=== Running environment tests ==="
    (cd "$ENV_TEST_DIR" && npx vitest run *.spec.ts)
}

run_env_test_file() {
    local absolute_path="$1"
    local relative_path
    relative_path=$(python3 - <<PY
import os
print(os.path.relpath(${absolute_path@Q}, ${ENV_TEST_DIR@Q}))
PY
)
    echo "=== Running environment test: ${relative_path} ==="
    (cd "$ENV_TEST_DIR" && npx vitest run "$relative_path")
}

run_all_tests() {
    run_env_tests
    run_server_tests
    run_client_unit_tests
    run_client_integration_tests
    run_client_e2e_tests
}

resolve_and_run_path() {
    local input_path="$1"
    local candidates=("$input_path" "$ROOT_DIR/$input_path" "$CLIENT_DIR/$input_path" "$ENV_TEST_DIR/$input_path" "$SERVER_DIR/$input_path")
    local resolved=""

    for candidate in "${candidates[@]}"; do
        if [ -f "$candidate" ]; then
            resolved="$(cd "$ROOT_DIR" && python3 - <<PY
import os
print(os.path.realpath(${candidate@Q}))
PY
)"
            break
        fi
    done

    if [ -z "$resolved" ]; then
        echo "Unable to resolve test path: $input_path" >&2
        return 1
    fi

    case "$resolved" in
        "$CLIENT_DIR"/e2e/*)
            run_client_e2e_spec "$resolved"
            ;;
        "$ENV_TEST_DIR"/*)
            run_env_test_file "$resolved"
            ;;
        "$SERVER_DIR"/tests/*)
            run_server_test_file "$resolved"
            ;;
        *)
            echo "No runner configured for: $input_path" >&2
            return 1
            ;;
    esac
}

if [[ ${1:-} == "-h" || ${1:-} == "--help" ]]; then
    print_usage
    exit 0
fi

if [ $# -eq 0 ]; then
    run_all_tests
    exit 0
fi

case "$1" in
    unit|client:unit)
        run_client_unit_tests
        ;;
    integration|client:integration)
        run_client_integration_tests
        ;;
    production|client:production)
        run_client_production_tests
        ;;
    e2e|client:e2e)
        run_client_e2e_tests
        ;;
    server|server:tests)
        run_server_tests
        ;;
    env|environment|env-tests)
        run_env_tests
        ;;
    all)
        run_all_tests
        ;;
    *)
        if ! resolve_and_run_path "$1"; then
            echo "" >&2
            print_usage >&2
            exit 1
        fi
        ;;
esac
