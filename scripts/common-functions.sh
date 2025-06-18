#!/bin/bash
# Common functions for all scripts

# Ensure nvm environment is loaded so globally installed node tools are in PATH
load_nvm() {
  if [ -d "$HOME/.nvm" ] && [ -s "$HOME/.nvm/nvm.sh" ]; then
    . "$HOME/.nvm/nvm.sh"
  fi
}

# Wait for a port to become available
wait_for_port() {
  local port="$1"
  local retry=300  # Increased timeout to 5 minutes for problematic ports
  local check_interval=1
  local last_check_time=0

  echo "Waiting for port ${port}..."

  # Give extra time for Firebase and API server ports
  if [ "$port" = "7091" ] || [ "$port" = "57000" ] || [ "$port" = "58080" ] || [ "$port" = "59099" ]; then
    retry=600  # 10 minutes for problematic ports
    echo "Extended timeout for port ${port} (10 minutes)"
  fi

  while [ ${retry} -gt 0 ]; do
    # Try multiple methods to check port availability
    local port_available=false

    # Method 1: netcat check
    if nc -z localhost "${port}" >/dev/null 2>&1; then
      port_available=true
    fi

    # Method 2: curl check for HTTP services (if netcat fails)
    if [ "$port_available" = false ]; then
      if curl -s --connect-timeout 2 "http://localhost:${port}/" >/dev/null 2>&1; then
        port_available=true
      fi
    fi

    # Method 3: lsof check (if both above fail)
    if [ "$port_available" = false ]; then
      if command -v lsof >/dev/null && lsof -i ":${port}" >/dev/null 2>&1; then
        port_available=true
      fi
    fi

    if [ "$port_available" = true ]; then
      echo "Port ${port} is ready"
      return 0
    fi

    # Progress indicator every 30 seconds for long waits
    if [ $((retry % 30)) -eq 0 ]; then
      echo "Still waiting for port ${port}... (${retry} seconds remaining)"

      # Show debug info every 2 minutes
      if [ $((retry % 120)) -eq 0 ]; then
        echo "Debug: Checking processes and logs for port ${port}..."
        ps aux | grep -E "(node|npm|firebase|tinylicious)" | grep -v grep || echo "No relevant processes found"

        # Check specific log files for this port
        case "$port" in
          7091)
            if [ -f "${ROOT_DIR}/server/logs/test-auth-service-tee.log" ]; then
              echo "=== API Server Log (last 10 lines) ==="
              tail -10 "${ROOT_DIR}/server/logs/test-auth-service-tee.log" || echo "Could not read API server log"
            fi
            ;;
          57000|58080|59099)
            if [ -f "${ROOT_DIR}/server/logs/firebase-emulator.log" ]; then
              echo "=== Firebase Emulator Log (last 10 lines) ==="
              tail -10 "${ROOT_DIR}/server/logs/firebase-emulator.log" || echo "Could not read Firebase log"
            fi
            ;;
        esac
      fi
    fi

    sleep ${check_interval}
    retry=$((retry-1))
  done

  echo "Timeout waiting for port ${port} after extended timeout"
  echo "Debug: Final check for port ${port}..."
  if command -v lsof >/dev/null; then
    lsof -i ":${port}" || echo "No process found on port ${port}"
  fi
  if command -v ss >/dev/null; then
    ss -tlnp | grep ":${port} " || echo "Port ${port} not found in ss output"
  fi

  # Show relevant log files for debugging
  case "$port" in
    7091)
      echo "=== API Server Log (last 20 lines) ==="
      if [ -f "${ROOT_DIR}/server/logs/test-auth-service-tee.log" ]; then
        tail -20 "${ROOT_DIR}/server/logs/test-auth-service-tee.log"
      else
        echo "API server log file not found"
      fi
      ;;
    57000|58080|59099)
      echo "=== Firebase Emulator Log (last 20 lines) ==="
      if [ -f "${ROOT_DIR}/server/logs/firebase-emulator.log" ]; then
        tail -20 "${ROOT_DIR}/server/logs/firebase-emulator.log"
      else
        echo "Firebase emulator log file not found"
      fi
      ;;
  esac

  return 1  # Return error instead of exit to allow script to continue
}

# Create log directories
create_log_directories() {
  for dir in "${LOG_DIRS[@]}"; do
    mkdir -p "${dir}"
  done
}

# Remove all files in log directories
clear_log_files() {
  for dir in "${LOG_DIRS[@]}"; do
    if [ -d "${dir}" ]; then
      rm -rf "${dir}"/* 2>/dev/null || true
    fi
  done
}

# Install npm dependencies if needed
npm_ci_if_needed() {
  if [ ! -d node_modules ]; then
    npm --proxy='' --https-proxy='' ci
  fi
}

# Kill processes on specified ports using the JavaScript script
kill_ports() {
  echo "Starting cleanup of development processes..."
  cd "${ROOT_DIR}"
  node scripts/kill-tinylicious.js
  return 0
}

# Install global packages if needed
install_global_packages() {
  if ! command -v firebase >/dev/null || ! command -v tinylicious >/dev/null; then
    sudo npm --proxy='' --https-proxy='' install -g firebase-tools tinylicious dotenv-cli cross-env @dotenvx/dotenvx || true
  fi

  # if ! command -v dprint >/dev/null; then
  #   curl -fsSL https://dprint.dev/install.sh | sudo sh
  # fi
  
  if ! command -v cross-env >/dev/null; then
    echo "cross-env not found after global install; attempting local install"
    sudo npm install -g cross-env || true
  fi
}

# Install OS utilities if needed
install_os_utilities() {
  # For Playwright's --with-deps chromium
  local playwright_deps=(
    libatk1.0-0
    libatk-bridge2.0-0
    libcups2
    libdbus-1-3
    libdrm2
    libgbm1
    libgtk-3-0
    libnspr4
    libnss3
    libx11-6
    libx11-xcb1
    libxcb1
    libxcomposite1
    libxdamage1
    libxext6
    libxfixes3
    libxrandr2
    libxtst6
    ca-certificates
    fonts-liberation
    lsb-release
    xdg-utils
    wget
  )

  # For original lsof and xvfb
  local original_deps=(
    lsof
    xvfb
  )

  # Check if any dependency is missing
  local needs_install=false
  for dep in "${original_deps[@]}" "${playwright_deps[@]}"; do
    if ! dpkg -s "${dep}" >/dev/null 2>&1; then
      needs_install=true
      break
    fi
  done

  if [ "$needs_install" = true ]; then
    sudo apt-get update
    DEBIAN_FRONTEND=noninteractive sudo apt-get -y install --no-install-recommends \
      "${original_deps[@]}" \
      "${playwright_deps[@]}"
  fi
}

# Setup environment files
setup_environment_files() {
  chmod +x "${ROOT_DIR}/scripts/setup-local-env.sh"
  "${ROOT_DIR}/scripts/setup-local-env.sh"
  
  set -a
  source "${ROOT_DIR}/server/.env"
  source "${ROOT_DIR}/client/.env"
  if [ -f "${ROOT_DIR}/client/.env.test" ]; then
    source "${ROOT_DIR}/client/.env.test"
  fi
  set +a
}

# Install all npm dependencies
install_all_dependencies() {
  echo "Installing dependencies..."
  
  # Server dependencies
  cd "${ROOT_DIR}/server"
  npm_ci_if_needed
  
  # Firebase Functions dependencies
  cd "${ROOT_DIR}/functions"
  npm_ci_if_needed
  
  # Client dependencies
  cd "${ROOT_DIR}/client"
  npm_ci_if_needed
  
  # Compile Paraglide if needed
  # if [ -z "${SKIP_PARAGLIDE_COMPILE}" ] && [ -d node_modules ]; then
  #   npx -y @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide
  # fi
  
  cd "${ROOT_DIR}"
}

# Start Firebase emulator
start_firebase_emulator() {
  if nc -z localhost ${FIREBASE_AUTH_PORT} >/dev/null 2>&1; then
    echo "Firebase emulator already running, stopping it first..."
    kill_ports
    sleep 2
  fi

  echo "Starting Firebase emulator..."
  cd "${ROOT_DIR}"

  # Check if firebase command is available
  if ! command -v firebase >/dev/null 2>&1; then
    echo "Warning: firebase command not found, trying to install..."
    npm install -g firebase-tools || {
      echo "Error: Could not install firebase-tools"
      return 1
    }
  fi

  # Start Firebase emulator with better error handling
  firebase emulators:start --project ${FIREBASE_PROJECT_ID} > "${ROOT_DIR}/server/logs/firebase-emulator.log" 2>&1 &
  local firebase_pid=$!

  # Give Firebase a moment to start
  sleep 3

  # Check if Firebase process is still running
  if ! kill -0 $firebase_pid 2>/dev/null; then
    echo "Warning: Firebase emulator process died immediately"
    if [ -f "${ROOT_DIR}/server/logs/firebase-emulator.log" ]; then
      echo "=== Firebase Emulator Error Log ==="
      cat "${ROOT_DIR}/server/logs/firebase-emulator.log"
    fi
    return 1
  fi

  cd "${ROOT_DIR}"
}

# Start Tinylicious server
start_tinylicious() {
  echo "Starting Tinylicious server on port ${TEST_FLUID_PORT}..."
  cd "${ROOT_DIR}/client"
  PORT=${TEST_FLUID_PORT} npx tinylicious > "${ROOT_DIR}/server/logs/tinylicious.log" 2>&1 &
  cd "${ROOT_DIR}"
}

# Start API server
start_api_server() {
  echo "Starting API server on port ${TEST_API_PORT}..."
  cd "${ROOT_DIR}/server"

  # Check if required files exist
  if [ ! -f ".env.test" ]; then
    echo "Warning: .env.test file not found in server directory"
    if [ -f ".env" ]; then
      echo "Using .env file instead"
      cp .env .env.test
    else
      echo "Error: No environment file found"
      cd "${ROOT_DIR}"
      return 1
    fi
  fi

  if [ ! -f "package.json" ]; then
    echo "Error: package.json not found in server directory"
    cd "${ROOT_DIR}"
    return 1
  fi

  # Check if dotenvx is available
  if ! command -v dotenvx >/dev/null 2>&1; then
    echo "Warning: dotenvx not found, trying to install..."
    npm install -g @dotenvx/dotenvx || {
      echo "Error: Could not install dotenvx"
      cd "${ROOT_DIR}"
      return 1
    }
  fi

  # Start API server with better error handling
  echo "Starting API server with command: npx dotenvx run --env-file=.env.test -- npm run dev -- --host 0.0.0.0 --port ${TEST_API_PORT}"
  npx dotenvx run --env-file=.env.test -- npm run dev -- --host 0.0.0.0 --port ${TEST_API_PORT} </dev/null > "${ROOT_DIR}/server/logs/test-auth-service-tee.log" 2>&1 &
  local api_pid=$!

  # Give API server a moment to start
  sleep 3

  # Check if API server process is still running
  if ! kill -0 $api_pid 2>/dev/null; then
    echo "Warning: API server process died immediately"
    if [ -f "${ROOT_DIR}/server/logs/test-auth-service-tee.log" ]; then
      echo "=== API Server Error Log ==="
      cat "${ROOT_DIR}/server/logs/test-auth-service-tee.log"
    fi
    cd "${ROOT_DIR}"
    return 1
  fi

  cd "${ROOT_DIR}"
}

# Start SvelteKit server
start_sveltekit_server() {
  echo "Starting SvelteKit server on port ${VITE_PORT}..."
  cd "${ROOT_DIR}/client"
  npx dotenvx run --env-file=.env.test -- npm --experimental-network-inspection run dev -- --host 0.0.0.0 --port ${VITE_PORT} </dev/null > "${ROOT_DIR}/server/logs/test-svelte-kit.log" 2>&1 &
  cd "${ROOT_DIR}"
}

# Wait for all required ports
wait_for_all_ports() {
  local failed_ports=()
  local critical_ports=(7091 57000)  # API server and Firebase Functions are critical
  local critical_failed=false

  echo "Checking all required ports: ${REQUIRED_PORTS[*]}"

  for port in "${REQUIRED_PORTS[@]}"; do
    echo "Checking port ${port}..."
    if ! wait_for_port ${port}; then
      failed_ports+=("${port}")
      echo "Warning: Port ${port} is not ready"

      # Check if this is a critical port
      for critical_port in "${critical_ports[@]}"; do
        if [ "$port" = "$critical_port" ]; then
          critical_failed=true
          echo "CRITICAL: Port ${port} is required for tests to run properly"
        fi
      done
    else
      echo "✓ Port ${port} is ready"
    fi
  done

  if [ ${#failed_ports[@]} -gt 0 ]; then
    echo "========================================="
    echo "PORT STATUS SUMMARY:"
    echo "Failed ports: ${failed_ports[*]}"

    # Show which services are affected
    for port in "${failed_ports[@]}"; do
      case "$port" in
        7090) echo "  - Port 7090: SvelteKit development server (VITE_PORT)" ;;
        7091) echo "  - Port 7091: API server (TEST_API_PORT) - CRITICAL" ;;
        7092) echo "  - Port 7092: Tinylicious server (TEST_FLUID_PORT)" ;;
        57000) echo "  - Port 57000: Firebase Functions emulator - CRITICAL" ;;
        58080) echo "  - Port 58080: Firebase Firestore emulator" ;;
        59099) echo "  - Port 59099: Firebase Auth emulator" ;;
        *) echo "  - Port ${port}: Unknown service" ;;
      esac
    done

    echo "========================================="

    if [ "$critical_failed" = true ]; then
      echo "ERROR: Critical services failed to start. Tests cannot proceed."
      echo "Please check the logs above for detailed error information."
      return 1
    else
      echo "WARNING: Some non-critical services failed to start."
      echo "Tests may still be able to run with reduced functionality."
      return 0  # Allow tests to continue with warnings
    fi
  fi

  echo "✓ All required ports are ready!"
  return 0
}
