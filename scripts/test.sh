#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(realpath "${SCRIPT_DIR}/..")"
CLIENT_DIR="${PROJECT_ROOT}/client"
LOGS_DIR="${PROJECT_ROOT}/logs/tests"
mkdir -p "$LOGS_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)


# Ensure shared configuration (ports, environment) is available for auxiliary helpers.
# The scripts/common-config.sh file expects ROOT_DIR to be defined.
ROOT_DIR="${PROJECT_ROOT}"
if [ -f "${SCRIPT_DIR}/common-config.sh" ]; then
  # shellcheck disable=SC1090
  source "${SCRIPT_DIR}/common-config.sh"
fi

ensure_services() {
  if [ "${SKIP_AUTO_SETUP:-0}" = "1" ]; then
    return
  fi

  # Check if PM2 is running and all required services are online.
  # If not, run setup.sh to (re)start everything.
  if ! node -e '
    const required = ["yjs-server", "vite-server", "firebase-emulators", "log-service"];
    try {
      const list = JSON.parse(require("child_process").execSync("pm2 jlist", { stdio: "pipe" }).toString());
      const online = list.filter(p => p.pm2_env.status === "online").map(p => p.name);
      const missing = required.filter(name => !online.includes(name));
      if (missing.length > 0) {
        console.error(`Missing PM2 services: ${missing.join(", ")}`);
        process.exit(1);
      }
      console.log("All required PM2 services are online.");
      process.exit(0);
    } catch (e) {
      console.error("Failed to get PM2 status. Assuming services need to be started.");
      process.exit(1); // Needs setup
    }
  ' >&2; then
    echo "Service check failed. Running setup..."
    "${SCRIPT_DIR}/setup.sh"
    return
  fi

  # If PM2 says online, verify responsiveness
  # Check Yjs Server (critical for tests)
  YJS_PORT="${TEST_YJS_PORT:-7093}"
  if ! curl -s --connect-timeout 2 --max-time 5 "http://127.0.0.1:${YJS_PORT}/health" >/dev/null; then
      echo "⚠️ Yjs server is online but not responding at http://127.0.0.1:${YJS_PORT}/health"
      echo "Restarting services..."
      "${SCRIPT_DIR}/setup.sh"
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

  ensure_services
  npm run test:unit
  npm run test:integration
  cleanup_e2e_coverage
  export PLAYWRIGHT_JSON_OUTPUT_NAME="${LOGS_DIR}/e2e-all-${TIMESTAMP}.json"
  NODE_ENV=test TEST_ENV=localhost ./node_modules/.bin/dotenvx run --overload --env-file=.env.test -- ./node_modules/.bin/playwright test
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

    # Also try e2e/ prefixed paths for E2E tests
    attempts+=("$CLIENT_DIR/e2e/$raw")
    attempts+=("$CLIENT_DIR/e2e/$trimmed")
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
    ensure_services
    cleanup_e2e_coverage
    for spec in "${normalized_paths[@]}"; do
      # Sanitize spec path for filename
      SAFE_SPEC_NAME=$(echo "$spec" | sed 's/[^a-zA-Z0-9]/_/g')
      export PLAYWRIGHT_JSON_OUTPUT_NAME="${LOGS_DIR}/e2e-${SAFE_SPEC_NAME}-${TIMESTAMP}.json"
      # Executing directly to avoid duplicate reporters from npm script
      NODE_ENV=test TEST_ENV=localhost ./node_modules/.bin/dotenvx run --overload --env-file=.env.test -- ./node_modules/.bin/playwright test "$spec" "${pass_through[@]}"
    done
    ;;
  *)
    echo "Unsupported test type: $detected_type" >&2
    exit 1
    ;;
esac
