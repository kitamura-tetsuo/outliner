#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(realpath "${SCRIPT_DIR}/..")"
CLIENT_DIR="${PROJECT_ROOT}/client"

# Ensure shared configuration (ports, environment) is available for auxiliary helpers.
# The scripts/common-config.sh file expects ROOT_DIR to be defined.
ROOT_DIR="${PROJECT_ROOT}"
if [ -f "${SCRIPT_DIR}/common-config.sh" ]; then
  # shellcheck disable=SC1090
  source "${SCRIPT_DIR}/common-config.sh"
fi

port_is_ready() {
  local port="$1"
  node -e 'const net=require("net");
const port=Number(process.argv[1]);
const socket=net.createConnection({ port, host: "127.0.0.1" }, () => {
  socket.end();
  process.exit(0);
});
socket.once("error", () => process.exit(1));
setTimeout(() => {
  socket.destroy();
  process.exit(1);
}, 500).unref();' "$port" >/dev/null 2>&1
}

ensure_codex_services() {
  if [ "${SKIP_AUTO_SETUP:-0}" = "1" ]; then
    return
  fi

  # Ports that setup.sh is responsible for. If any are missing we trigger setup.
  local required_ports=(
    "${TEST_API_PORT:-7091}"
    "${VITE_PORT:-7090}"
    "${TEST_YJS_PORT:-7093}"
    "${FIREBASE_FUNCTIONS_PORT:-57070}"
    "${FIREBASE_AUTH_PORT:-59099}"
    "${FIREBASE_FIRESTORE_PORT:-58080}"
    "${FIREBASE_HOSTING_PORT:-57000}"
    "${FIREBASE_STORAGE_PORT:-59200}"
  )

  local need_setup=0
  local port
  for port in "${required_ports[@]}"; do
    if ! port_is_ready "$port"; then
      need_setup=1
      break
    fi
  done

  if [ "$need_setup" -eq 1 ]; then
    "${SCRIPT_DIR}/setup.sh"
  fi
}

cd "$PROJECT_ROOT"

if [ $# -eq 0 ]; then
  cd "$CLIENT_DIR"

  # Run ESLint check
  echo "Running ESLint check..."
  if ! npm run lint; then
    echo "❌ ESLint check failed!"
    exit 1
  fi
  echo "✅ ESLint check passed!"

  npm run test:unit
  npm run test:integration
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

# Run ESLint check before running tests
echo "Running ESLint check..."
if ! npm run lint; then
  echo "❌ ESLint check failed!"
  exit 1
fi
echo "✅ ESLint check passed!"

case "$detected_type" in
  unit)
    npm run test:unit -- "${normalized_paths[@]}" "${pass_through[@]}"
    ;;
  integration)
    npm run test:integration -- "${normalized_paths[@]}" "${pass_through[@]}"
    ;;
  production)
    npm run test:production -- "${normalized_paths[@]}" "${pass_through[@]}"
    ;;
  e2e)
    ensure_codex_services
    for spec in "${normalized_paths[@]}"; do
      npm run test:e2e -- "$spec" "${pass_through[@]}"
    done
    ;;
  *)
    echo "Unsupported test type: $detected_type" >&2
    exit 1
    ;;
esac
