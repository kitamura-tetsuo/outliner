#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(realpath "${SCRIPT_DIR}/..")"
CLIENT_DIR="${PROJECT_ROOT}/client"
LOGS_DIR="${PROJECT_ROOT}/logs/tests"
mkdir -p "$LOGS_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)


# In the CI container, server build artifacts are in /cache. Copy them to the workspace.
if [ -d "/cache/server/dist" ]; then
  echo "CI environment detected. Copying server build artifacts..."
  mkdir -p "${PROJECT_ROOT}/server"
  cp -r "/cache/server/dist" "${PROJECT_ROOT}/server/"
fi


# Ensure shared configuration (ports, environment) is available for auxiliary helpers.
# The scripts/common-config.sh file expects ROOT_DIR to be defined.
ROOT_DIR="${PROJECT_ROOT}"
if [ -f "${SCRIPT_DIR}/common-config.sh" ]; then
  # shellcheck disable=SC1090
  source "${SCRIPT_DIR}/common-config.sh"
fi

ensure_codex_services() {
  if [ "${SKIP_AUTO_SETUP:-0}" = "1" ]; then
    return
  fi

  local required_processes=(
    "yjs-server"
    "log-service"
    "firebase-emulators"
    "vite-server"
  )

  local need_setup=0
  local process_name
  for process_name in "${required_processes[@]}"; do
    # Suppress grep's exit code if it finds nothing
    local status
    status=$(npx pm2 info "$process_name" | grep "status" | awk '{print $4}' || true)

    if [ "$status" != "online" ]; then
      echo "Service '$process_name' is not online (status: ${status:-"Not found"})."
      need_setup=1
      break
    fi
  done

  if [ "$need_setup" -eq 1 ]; then
    echo "One or more services are not running. Triggering setup..."
    "${SCRIPT_DIR}/setup.sh"
  else
    echo "All services are running."
  fi
}

cleanup_e2e_coverage() {
  if [ -f "${CLIENT_DIR}/scripts/cleanup-e2e-raw-coverage.js" ]; then
    node "${CLIENT_DIR}/scripts/cleanup-e2e-raw-coverage.js"
  fi
}

cd "$PROJECT_ROOT"

if [ $# -eq 0 ]; then
  cd "$CLIENT_DIR"

  # Run for JSON output (ignore failure here to allow standard run to proceed/fail naturally, 
  # but we want to capture logs if possible. If it fails, we still want the standard run to show output)
  # Actually, if we want to fail if lint fails, we should capture the exit code of the standard run.
  # But we also want the JSON report.
  
  echo "Generating ESLint JSON report..."
  npm run lint -- --format json --output-file "${LOGS_DIR}/lint-${TIMESTAMP}.json" || true

  if ! npm run lint -- --quiet; then
    echo "❌ ESLint check failed!"
    exit 1
  fi
  echo "✅ ESLint check passed!"

  ensure_codex_services
  npm run test:unit
  npm run test:integration
  cleanup_e2e_coverage
  npm run test:e2e --
  exit 0
fi

test_paths=()
pass_through=()
collecting_passthrough="false"

for arg in "$@"; do
  if [ "$collecting_passthrough" = "true" ]; then
    pass_through+=("$arg")
    continue
  fi

  if [[ "$arg" == "--" ]]; then
    collecting_passthrough="true"
    continue
  fi

  test_paths+=("$arg")
done

if [ ${#test_paths[@]} -eq 0 ]; then
  echo "No test scripts provided. Unable to infer test type." >&2
  exit 1
fi

normalize_to_client() {
  local raw="$1"
  local trimmed="${raw#./}"
  local attempts=()

  if [[ "$raw" == /* ]]; then
    attempts+=("$raw")
  else
    attempts+=("$PROJECT_ROOT/$raw")
    attempts+=("$PROJECT_ROOT/$trimmed")
    attempts+=("$CLIENT_DIR/$raw")
    attempts+=("$CLIENT_DIR/$trimmed")

    if [[ "$trimmed" == client/* ]]; then
      local without_client="${trimmed#client/}"
      attempts+=("$CLIENT_DIR/$without_client")
    fi
  fi

  local candidate
  for candidate in "${attempts[@]}"; do
    if [[ "$candidate" != /* ]]; then
      continue
    fi

    if [ -e "$candidate" ]; then
      local abs
      if abs="$(realpath "$candidate" 2>/dev/null)"; then
        if [[ "$abs" == "$CLIENT_DIR"/* ]]; then
          echo "${abs#$CLIENT_DIR/}"
          return 0
        fi
      fi
    fi
  done

  return 1
}

infer_test_type() {
  local rel="$1"

  if [[ "$rel" == e2e || "$rel" == e2e/* ]]; then
    echo "e2e"
    return 0
  fi

  if [[ "$rel" == src/tests/integration || "$rel" == src/tests/integration/* || "$rel" == tests/integration || "$rel" == tests/integration/* ]]; then
    echo "integration"
    return 0
  fi

  if [[ "$rel" == src/tests/production || "$rel" == src/tests/production/* || "$rel" == tests/production || "$rel" == tests/production/* ]]; then
    echo "production"
    return 0
  fi

  if [[ "$rel" == src/tests/unit || "$rel" == src/tests/unit/* || "$rel" == tests/unit || "$rel" == tests/unit/* ]]; then
    echo "unit"
    return 0
  fi

  if [[ "$rel" == src/tests/* || "$rel" == src/* ]]; then
    echo "unit"
    return 0
  fi

  return 1
}

normalized_paths=()
detected_type=""

for raw_path in "${test_paths[@]}"; do
  if ! relative_path="$(normalize_to_client "$raw_path")"; then
    echo "Unable to resolve path inside client/: $raw_path" >&2
    exit 1
  fi

  normalized_paths+=("$relative_path")

  if ! current_type="$(infer_test_type "$relative_path")"; then
    echo "Unable to infer test type for: $raw_path" >&2
    exit 1
  fi

  if [ -z "$detected_type" ]; then
    detected_type="$current_type"
  elif [ "$detected_type" != "$current_type" ]; then
    echo "Conflicting test types inferred: $detected_type vs $current_type" >&2
    exit 1
  fi
done

echo "Detected test type: $detected_type"

cd "$CLIENT_DIR"

case "$detected_type" in
  unit)
    npm run test:unit -- "${normalized_paths[@]}" "${pass_through[@]}" --reporter=default --reporter=json --outputFile="${LOGS_DIR}/unit-${TIMESTAMP}.json"
    ;;
  integration)
    npm run test:integration -- "${normalized_paths[@]}" "${pass_through[@]}" --reporter=default --reporter=json --outputFile="${LOGS_DIR}/integration-${TIMESTAMP}.json"
    ;;
  production)
    npm run test:production -- "${normalized_paths[@]}" "${pass_through[@]}" --reporter=default --reporter=json --outputFile="${LOGS_DIR}/production-${TIMESTAMP}.json"
    ;;
  e2e)
    ensure_codex_services
    cleanup_e2e_coverage
    for spec in "${normalized_paths[@]}"; do
      # Sanitize spec path for filename
      SAFE_SPEC_NAME=$(echo "$spec" | sed 's/[^a-zA-Z0-9]/_/g')
      export PLAYWRIGHT_JSON_OUTPUT_NAME="${LOGS_DIR}/e2e-${SAFE_SPEC_NAME}-${TIMESTAMP}.json"
      npm run test:e2e -- "$spec" "${pass_through[@]}" --reporter=list,json
    done
    ;;
  *)
    echo "Unsupported test type: $detected_type" >&2
    exit 1
    ;;
esac
