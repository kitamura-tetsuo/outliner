#!/bin/bash

# Full Fluid vs Yjs snapshot comparison runner (Yjs side)
set -e

log() { echo -e "$1"; }
info(){ log "\033[34m[INFO]\033[0m $1"; }
ok(){ log "\033[32m[SUCCESS]\033[0m $1"; }
warn(){ log "\033[33m[WARNING]\033[0m $1"; }
err(){ log "\033[31m[ERROR]\033[0m $1"; }
section(){ echo; log "\033[35m=== $1 ===\033[0m"; echo; }

# Paths
OUTLINER_YJS_DIR="/home/ubuntu/src2/outliner"
OUTLINER_FLUID_DIR="/home/ubuntu/src2/outliner-fluid"
CURRENT_DIR=$(pwd)
TEST_TIMEOUT=300
SERVER_STARTUP_WAIT=30

# Options
COMPARE_ONLY=false
FLUID_ONLY=false
YJS_ONLY=false
SPEC_PATH=""

usage(){
  cat <<USAGE
Usage: $(basename "$0") [OPTIONS]

Options:
  --compare-only   Compare existing snapshots only (no tests)
  --fluid-only     Run Fluid tests only (no compare)
  --yjs-only       Run Yjs tests only (no compare)
  --spec <path>    Run only the specified Playwright spec
  -h, --help       Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --compare-only) COMPARE_ONLY=true; shift ;;
    --fluid-only)   FLUID_ONLY=true; shift ;;
    --yjs-only)     YJS_ONLY=true; shift ;;
    --spec)         SPEC_PATH="$2"; shift 2 ;;
    -h|--help)      usage; exit 0 ;;
    *) err "Unknown option: $1"; usage; exit 1 ;;
  esac
done

# Validate option combinations
if $COMPARE_ONLY && { $FLUID_ONLY || $YJS_ONLY; }; then
  err "--compare-only cannot be combined with --fluid-only/--yjs-only"
  exit 1
fi
if $FLUID_ONLY && $YJS_ONLY; then
  err "Cannot specify both --fluid-only and --yjs-only"
  exit 1
fi

cleanup(){
  info "Cleaning up background processes..."
  pkill -f "vite dev" || true
  pkill -f "npm run dev" || true
  pkill -f "node.*vite" || true
  pkill -f "firebase-tools" || true
  pkill -f "java.*firebase" || true
  lsof -ti:7090 | xargs kill -9 2>/dev/null || true
  sleep 2
}

start_server(){
  local name=$1; local dir=$2
  section "Starting $name server"
  cd "$dir"
  if [ -f scripts/setup.sh ]; then
    info "Running codex-setup for $name..."
    bash scripts/setup.sh >/dev/null 2>&1 || true
  fi
  cd "$dir/client"
  if [ ! -d node_modules ]; then
    info "Installing dependencies for $name..."
    npm install >/dev/null 2>&1
  fi
  info "Launching dev server for $name..."
  npm run dev -- --port 7090 --host 0.0.0.0 >/dev/null 2>&1 &
  sleep ${SERVER_STARTUP_WAIT}
  if curl -s http://localhost:7090/ >/dev/null; then ok "$name server up"; else err "$name server failed"; return 1; fi
  cd "$CURRENT_DIR"
}

run_tests(){
  local name=$1; local dir=$2
  section "Running $name tests"
  cd "$dir/client"
  mkdir -p e2e-snapshots
  rm -f e2e-snapshots/*.json 2>/dev/null || true
  if [ -n "$SPEC_PATH" ]; then
    info "Running only spec: $SPEC_PATH"
    if ! timeout ${TEST_TIMEOUT} npm run test:e2e -- "$SPEC_PATH" >/dev/null 2>&1; then
      warn "$name e2e spec reported failures (continuing)"
    fi
  else
    if ! timeout ${TEST_TIMEOUT} npm run test:e2e >/dev/null 2>&1; then
      warn "$name e2e tests reported failures (continuing)"
    fi
  fi
  local cnt=$(ls e2e-snapshots/*.json 2>/dev/null | wc -l || echo 0)
  info "${name} snapshot files: ${cnt}"
  cd "$CURRENT_DIR"
}

compare(){
  section "Comparing snapshots"
  mkdir -p "$OUTLINER_YJS_DIR/client/e2e-snapshots"
  cp "$OUTLINER_FLUID_DIR/client/e2e-snapshots"/*-fluid.json "$OUTLINER_YJS_DIR/client/e2e-snapshots/" 2>/dev/null || true
  cd "$OUTLINER_YJS_DIR/client"
  local compare_cmd=(node scripts/compareSnapshots.js)
  if [ -n "$SPEC_PATH" ]; then
    compare_cmd+=(--file "$SPEC_PATH" --fluid-dir "$OUTLINER_FLUID_DIR/client/e2e-snapshots")
  fi
  if "${compare_cmd[@]}"; then ok "Snapshots match"; return 0; else err "Snapshot differences found"; return 1; fi
}

trap 'cleanup' EXIT

section "Fluid vs Yjs Snapshot Comparison (Yjs branch)"

if [ ! -d "$OUTLINER_FLUID_DIR" ]; then err "Fluid branch directory not found: $OUTLINER_FLUID_DIR"; exit 1; fi
if [ ! -d "$OUTLINER_YJS_DIR" ]; then err "Yjs branch directory not found: $OUTLINER_YJS_DIR"; exit 1; fi

# Compare-only mode
if $COMPARE_ONLY; then
  compare
  exit $?
fi

cleanup

# Fluid-only mode
if $FLUID_ONLY; then
  start_server "Fluid" "$OUTLINER_FLUID_DIR" || true
  run_tests "Fluid" "$OUTLINER_FLUID_DIR"
  cleanup
  info "Skipping comparison (fluid-only mode)"
  exit 0
fi

# Yjs-only mode
if $YJS_ONLY; then
  start_server "Yjs" "$OUTLINER_YJS_DIR" || true
  run_tests "Yjs" "$OUTLINER_YJS_DIR"
  cleanup
  info "Skipping comparison (yjs-only mode)"
  exit 0
fi

# Default: run both and compare
start_server "Fluid" "$OUTLINER_FLUID_DIR" || true
run_tests "Fluid" "$OUTLINER_FLUID_DIR"
cleanup
start_server "Yjs" "$OUTLINER_YJS_DIR" || true
run_tests "Yjs" "$OUTLINER_YJS_DIR"
cleanup

compare
