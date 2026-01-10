#!/bin/bash
# Common functions for all scripts

# Native libraries required for node-canvas builds. Keep this list in sync with
# setup.sh to avoid missing system packages when tests need Canvas APIs.
CANVAS_NATIVE_DEPS=(
  build-essential
  pkg-config
  libcairo2
  libcairo2-dev
  libpango-1.0-0
  libpango1.0-dev
  libjpeg-dev
  libgif-dev
  librsvg2-dev
)

# Ensure nvm environment is loaded so globally installed node tools are in PATH
load_nvm() {
  if [ -d "$HOME/.nvm" ] && [ -s "$HOME/.nvm/nvm.sh" ]; then
    . "$HOME/.nvm/nvm.sh"
  fi
}

# Run apt-get with automatic retry and dpkg repair to handle transient failures
retry_apt_get() {
  local attempts=0
  local max_attempts=3
  while true; do
    if sudo apt-get "$@"; then
      break
    fi
    attempts=$((attempts+1))
    if [ "$attempts" -ge "$max_attempts" ]; then
      return 1
    fi
    echo "apt-get $* failed (attempt ${attempts}/${max_attempts}); repairing and retrying..."
    sudo dpkg --configure -a || true
    sleep 2
  done
}

# Wait for a port to become available
wait_for_port() {
  local port="$1"
  local retry=180  # Increased timeout to 3 minutes
  local check_interval=1
  local last_check_time=0

  echo "Waiting for port ${port}..."

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

    # Progress indicator every 10 seconds
    if [ $((retry % 10)) -eq 0 ]; then
      echo "Still waiting for port ${port}... (${retry} seconds remaining)"
    fi

    sleep ${check_interval}
    retry=$((retry-1))
  done

  echo "Timeout waiting for port ${port} after 3 minutes"
  echo "Debug: Checking what's running on port ${port}..."
  if command -v lsof >/dev/null; then
    lsof -i ":${port}" || echo "No process found on port ${port}"
  fi
  if command -v netstat >/dev/null; then
    netstat -tlnp | grep ":${port} " || echo "Port ${port} not found in netstat"
  fi
  return 1  # Return error instead of exit to allow script to continue
}

# Quick check: is a port open without waiting (no dependency on nc)
port_is_open() {
  local port="$1"
  if nc -z localhost "${port}" >/dev/null 2>&1; then
    return 0
  fi
  if curl -s --connect-timeout 2 "http://localhost:${port}/" >/dev/null 2>&1; then
    return 0
  fi
  if command -v lsof >/dev/null 2>&1 && lsof -i ":${port}" >/dev/null 2>&1; then
    return 0
  fi
  return 1
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
  # Fix permissions before installing
  if [ -d "node_modules" ] && [ "$(stat -c %U node_modules 2>/dev/null || echo "unknown")" = "root" ]; then
    echo "Fixing node_modules ownership before npm install..."
    sudo chown -R node:node "node_modules" || true
  fi
  
  if [ ! -d node_modules ] || ! npm ls >/dev/null 2>&1; then
    if [ -f package-lock.json ]; then
      echo "Running npm ci for dependencies in $(pwd)..."
      if ! npm_config_proxy="" npm_config_https_proxy="" npm ci; then
        echo "Warning: npm ci failed. Retrying with npm install in $(pwd)..."
        npm_config_proxy="" npm_config_https_proxy="" npm install
      fi
    else
      echo "Running npm install for dependencies in $(pwd)..."
      npm_config_proxy="" npm_config_https_proxy="" npm install
    fi
  fi
}

# PM2 Helper Functions for Test Environment Management

# Ensure PM2 is installed
ensure_pm2() {
  if ! command -v pm2 >/dev/null 2>&1; then
    echo "Installing PM2 globally..."
    npm_config_proxy="" npm_config_https_proxy="" npm install -g pm2
  fi
}

# Start all PM2 processes (idempotent - ensures processes are running)
pm2_start_all() {
  echo "Starting PM2 processes..."
  ensure_pm2

  cd "${ROOT_DIR}"

  # Start Firebase emulator first (it's the foundational service)
  if ! pm2 list | grep -q "firebase-emulator"; then
    echo "Starting Firebase emulator..."
    pm2 start ecosystem.firebase.config.js
  else
    echo "Firebase emulator already running, ensuring it's started..."
    pm2 restart firebase-emulator || pm2 start firebase-emulator
  fi

  # Start Node.js services
  if ! pm2 list | grep -q "yjs-server"; then
    echo "Starting Yjs server..."
    pm2 start ecosystem.config.js --only yjs-server
  else
    echo "Yjs server already running, ensuring it's started..."
    pm2 restart yjs-server || pm2 start yjs-server
  fi

  if ! pm2 list | grep -q "sveltekit-server"; then
    echo "Starting SvelteKit server..."
    pm2 start ecosystem.config.js --only sveltekit-server
  else
    echo "SvelteKit server already running, ensuring it's started..."
    pm2 restart sveltekit-server || pm2 start sveltekit-server
  fi

  if ! pm2 list | grep -q "api-server"; then
    echo "Starting API server..."
    pm2 start ecosystem.config.js --only api-server
  else
    echo "API server already running, ensuring it's started..."
    pm2 restart api-server || pm2 start api-server
  fi

  # Save PM2 process list for resurrection
  pm2 save

  echo "All PM2 processes started"
}

# Stop all PM2 processes
pm2_stop_all() {
  echo "Stopping all PM2 processes..."
  cd "${ROOT_DIR}"
  if command -v pm2 >/dev/null 2>&1; then
    pm2 kill 2>/dev/null || true
    echo "All PM2 processes stopped"
  fi
}

# Restart all PM2 processes
pm2_restart_all() {
  echo "Restarting all PM2 processes..."
  cd "${ROOT_DIR}"
  if command -v pm2 >/dev/null 2>&1; then
    pm2 restart all
    pm2 save
    echo "All PM2 processes restarted"
  fi
}

# Check PM2 status for all services
pm2_status() {
  echo "PM2 Process Status:"
  cd "${ROOT_DIR}"
  if command -v pm2 >/dev/null 2>&1; then
    pm2 list
  else
    echo "PM2 is not installed"
  fi
}

# Check if all required services are running via PM2
pm2_all_running() {
  local all_running=true
  local services=("firebase-emulator" "yjs-server" "sveltekit-server" "api-server")

  for service in "${services[@]}"; do
    if ! pm2 list | grep -q "${service}.*online"; then
      echo "Service not running: ${service}"
      all_running=false
    fi
  done

  if [ "$all_running" = true ]; then
    return 0
  else
    return 1
  fi
}

# Get PM2 logs for a specific service
pm2_logs() {
  local service="${1:-all}"
  cd "${ROOT_DIR}"
  if command -v pm2 >/dev/null 2>&1; then
    pm2 logs "$service" --lines 50 --nostream
  fi
}

# Kill processes on specified ports using the JavaScript script (legacy fallback)
kill_ports() {
  echo "Starting cleanup of development processes..."

  # First try PM2 kill if available
  if command -v pm2 >/dev/null 2>&1; then
    echo "Stopping all PM2 processes..."
    pm2 kill 2>/dev/null || true
  fi

  # Fallback to port-based cleanup for any remaining processes
  cd "${ROOT_DIR}"
  node scripts/kill-tinylicious.js
  return 0
}

# Install global packages if needed
install_global_packages() {
  if ! command -v firebase >/dev/null || ! command -v tinylicious >/dev/null || ! command -v pm2 >/dev/null; then
    echo "Installing global packages (firebase-tools, tinylicious, pm2)..."
    npm_config_proxy="" npm_config_https_proxy="" npm install -g firebase-tools tinylicious dotenv-cli @dotenvx/dotenvx pm2 || true
  fi

  # if ! command -v dprint >/dev/null; then
  #   curl -fsSL https://dprint.dev/install.sh | sudo sh
  # fi

}

# Install OS utilities if needed
install_os_utilities() {
  # Check if Java is installed and compatible with Firebase
  if ! command -v java >/dev/null 2>&1; then
    echo "Java not found. Installing OpenJDK 17 for Firebase compatibility..."
    retry_apt_get update
    DEBIAN_FRONTEND=noninteractive retry_apt_get -y install --no-install-recommends openjdk-17-jre-headless
  else
    # Check Java version (Firebase requires Java 11+)
    java_version=$(java -version 2>&1 | head -n1 | cut -d'"' -f2 | cut -d'.' -f1)
    if [ "$java_version" -lt 11 ] 2>/dev/null; then
      echo "Java version $java_version is too old for Firebase. Installing OpenJDK 17..."
      retry_apt_get update
      DEBIAN_FRONTEND=noninteractive retry_apt_get -y install --no-install-recommends openjdk-17-jre-headless
    else
      echo "Java version $java_version is compatible with Firebase"
    fi
  fi

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

  # For original lsof
  local original_deps=(
    lsof
  )

  # Check if any dependency is missing
  local needs_install=false
  for dep in "${original_deps[@]}" "${playwright_deps[@]}" "${CANVAS_NATIVE_DEPS[@]}"; do
    if ! dpkg -s "${dep}" >/dev/null 2>&1; then
      needs_install=true
      break
    fi
  done

  if [ "$needs_install" = true ]; then
    retry_apt_get update
    DEBIAN_FRONTEND=noninteractive retry_apt_get -y install --no-install-recommends \
      "${original_deps[@]}" \
      "${playwright_deps[@]}" \
      "${CANVAS_NATIVE_DEPS[@]}"
  fi

  # Install Playwright browser (system dependencies should be handled by install_os_utilities)
  cd "${ROOT_DIR}/client"
  echo "Installing Playwright chromium..."
  npx --yes playwright install chromium || echo "Playwright install failed, continuing..."
  echo "Installing Playwright dependencies..."
  npx --yes playwright install-deps chromium || echo "Playwright deps install failed, continuing..."

  cd "${ROOT_DIR}"
}

# Re-run later to enforce node-canvas system requirements even if the main
# install step was skipped by the sentinel file.
ensure_canvas_native_deps() {
  local missing=()
  for dep in "${CANVAS_NATIVE_DEPS[@]}"; do
    if ! dpkg -s "${dep}" >/dev/null 2>&1; then
      missing+=("${dep}")
    fi
  done

  if [ ${#missing[@]} -gt 0 ]; then
    retry_apt_get update
    DEBIAN_FRONTEND=noninteractive retry_apt_get -y install --no-install-recommends "${missing[@]}"
  fi
}

# Setup environment files (inline; no external script)
setup_environment_files() {
  # Root .env for dotenvx compatibility
  if [ ! -f "${ROOT_DIR}/.env" ]; then
    cat >> "${ROOT_DIR}/.env" <<'EOV'
# Root environment file for dotenvx compatibility
NODE_ENV=development
EOV
    echo "Created .env"
  fi

  # Client env files
  if [ ! -f "${ROOT_DIR}/client/.env.test" ]; then
    cat >> "${ROOT_DIR}/client/.env.test" <<'EOV'
VITE_IS_TEST=true
VITE_USE_FIREBASE_EMULATOR=true
VITE_FIREBASE_EMULATOR_HOST=localhost
VITE_USE_TINYLICIOUS=true
EOV
    echo "Created client/.env.test"
  fi
  if [ ! -f "${ROOT_DIR}/client/.env" ] && [ -f "${ROOT_DIR}/client/.env.test" ]; then
    cp "${ROOT_DIR}/client/.env.test" "${ROOT_DIR}/client/.env"
    echo "Created client/.env"
  fi

  # Server env files
  if [ ! -f "${ROOT_DIR}/server/.env.test" ]; then
    # Keep empty unless needed
    touch "${ROOT_DIR}/server/.env.test"
    echo "Created server/.env.test"
  fi
  if [ ! -f "${ROOT_DIR}/server/.env" ]; then
    cp "${ROOT_DIR}/server/.env.test" "${ROOT_DIR}/server/.env"
    echo "Created server/.env"
  fi

  # Functions env files (non-reserved variables only)
  if [ ! -f "${ROOT_DIR}/functions/.env.test" ]; then
    cat >> "${ROOT_DIR}/functions/.env.test" <<'EOV'
AZURE_TENANT_ID=test-tenant-id
AZURE_ENDPOINT=https://test.fluidrelay.azure.com
AZURE_PRIMARY_KEY=test-primary-key
AZURE_SECONDARY_KEY=test-secondary-key
AZURE_ACTIVE_KEY=primary
EOV
    echo "Created functions/.env.test"
  fi
  if [ ! -f "${ROOT_DIR}/functions/.env" ]; then
    cp "${ROOT_DIR}/functions/.env.test" "${ROOT_DIR}/functions/.env"
    echo "Created functions/.env"
  fi

  # Export for this session
  set -a
  [ -f "${ROOT_DIR}/server/.env" ] && source "${ROOT_DIR}/server/.env"
  [ -f "${ROOT_DIR}/client/.env" ] && source "${ROOT_DIR}/client/.env"
  [ -f "${ROOT_DIR}/client/.env.test" ] && source "${ROOT_DIR}/client/.env.test"
  set +a
}

# Install all npm dependencies
install_all_dependencies() {
  echo "Installing dependencies..."

  # Fix permissions before installing, but only if not in a CI environment
  if [ -z "${CI:-}" ]; then
    echo "Fixing permissions before installing dependencies..."
    for dir in "${ROOT_DIR}/client" "${ROOT_DIR}/server" "${ROOT_DIR}/functions" "${ROOT_DIR}/scripts/tests"; do
      if [ -d "$dir" ]; then
        # Fix node_modules ownership if needed
        if [ -d "${dir}/node_modules" ] && [ "$(stat -c %U ${dir}/node_modules 2>/dev/null || echo "unknown")" = "root" ]; then
          echo "Fixing node_modules ownership in $dir..."
          sudo chown -R node:node "${dir}/node_modules" || true
        fi
        # Ensure directory is owned by node user
        if [ "$(stat -c %U $dir)" = "root" ]; then
          echo "Fixing ownership for $dir..."
          sudo chown -R node:node "$dir" || true
        fi
      fi
    done
  else
    echo "Skipping permission fixes in CI environment."
  fi

  # Server dependencies
  cd "${ROOT_DIR}/server"
  npm_ci_if_needed

  # Firebase Functions dependencies
  cd "${ROOT_DIR}/functions"
  npm_ci_if_needed

  # Client dependencies
  cd "${ROOT_DIR}/client"
  npm_ci_if_needed

  # Development environment test dependencies
  cd "${ROOT_DIR}/scripts/tests"
  npm_ci_if_needed

  # Compile Paraglide if needed
  # if [ -z "${SKIP_PARAGLIDE_COMPILE}" ] && [ -d node_modules ]; then
  #   npx -y @inlang/paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide
  # fi

  cd "${ROOT_DIR}"
}

# Start Firebase emulator using PM2
start_firebase_emulator() {
  echo "Starting Firebase emulator via PM2..."

  # Check if Firebase emulator is already running via PM2
  if pm2 list 2>/dev/null | grep -q "firebase-emulator.*online"; then
    echo "Firebase emulator already running via PM2, restarting to ensure clean state..."
    pm2 restart firebase-emulator
  else
    # Ensure PM2 is installed
    ensure_pm2

    # Kill any existing emulator processes first
    pkill -9 -f "firebase emulators:start" 2>/dev/null || true
    sleep 2

    echo "Starting Firebase emulator..."
    cd "${ROOT_DIR}"
    pm2 start ecosystem.firebase.config.js
  fi

  # Wait for Firebase emulator to be ready
  echo "Waiting for Firebase emulator services to start..."
  local timeout=90
  local elapsed=0
  local auth_ready=false
  local functions_ready=false
  local hosting_ready=false

  while [ $elapsed -lt $timeout ]; do
    if [ "$auth_ready" = false ] && port_is_open ${FIREBASE_AUTH_PORT}; then
      auth_ready=true
      echo "Firebase Auth emulator is ready on port ${FIREBASE_AUTH_PORT}"
    fi
    if [ "$functions_ready" = false ] && port_is_open ${FIREBASE_FUNCTIONS_PORT}; then
      functions_ready=true
      echo "Firebase Functions emulator is ready on port ${FIREBASE_FUNCTIONS_PORT}"
    fi
    if [ "$hosting_ready" = false ] && port_is_open ${FIREBASE_HOSTING_PORT}; then
      hosting_ready=true
      echo "Firebase Hosting emulator is ready on port ${FIREBASE_HOSTING_PORT}"
    fi

    if [ "$auth_ready" = true ] && [ "$functions_ready" = true ] && [ "$hosting_ready" = true ]; then
      echo "All Firebase emulator core services are ready."
      break
    fi

    sleep 2
    elapsed=$((elapsed + 2))
    if [ $((elapsed % 20)) -eq 0 ]; then
      echo "Still waiting for Firebase services... ($((timeout - elapsed))s remaining)"
    fi
  done

  # Additional wait for Firebase Functions to fully initialize
  echo "Waiting additional 20 seconds for Firebase Functions to fully initialize..."
  sleep 20

  # Initialize Firebase emulator (admin + test user)
  echo "Launching Firebase emulator initializer (admin + test user)..."
  export FIREBASE_AUTH_EMULATOR_HOST="localhost:${FIREBASE_AUTH_PORT}"
  export AUTH_EMULATOR_HOST="localhost:${FIREBASE_AUTH_PORT}"
  export FIRESTORE_EMULATOR_HOST="localhost:${FIREBASE_FIRESTORE_PORT}"
  export FIREBASE_EMULATOR_HOST="localhost:${FIREBASE_FUNCTIONS_PORT}"
  node "${ROOT_DIR}/server/scripts/init-firebase-emulator.js"

  # Save PM2 state
  pm2 save

  # Verify Firebase Functions endpoints
  echo "Verifying Firebase Functions endpoints..."

  # Test get-container-users endpoint
  response=$(curl -s -w "%{http_code}" -o /dev/null -X POST -H "Content-Type: application/json" -d '{"idToken":"invalid-token","containerId":"test-container"}' "http://localhost:${FIREBASE_HOSTING_PORT}/api/get-container-users")
  if [ "$response" = "401" ]; then
    echo "✅ get-container-users endpoint is working correctly"
  else
    echo "⚠️ get-container-users endpoint returned status: $response"
  fi

  # Test adminCheckForContainerUserListing endpoint
  response=$(curl -s -w "%{http_code}" -o /dev/null -X POST -H "Content-Type: application/json" -d '{"idToken":"invalid-token","containerId":"test-container"}' "http://localhost:${FIREBASE_HOSTING_PORT}/api/adminCheckForContainerUserListing")
  if [ "$response" = "401" ]; then
    echo "✅ adminCheckForContainerUserListing endpoint is working correctly"
  else
    echo "⚠️ adminCheckForContainerUserListing endpoint returned status: $response"
  fi

  echo "Firebase emulator started via PM2"
}

# Start Yjs WebSocket server (auth + persistence) using PM2
start_yjs_server() {
  echo "Starting Yjs WebSocket server on port ${TEST_YJS_PORT}..."

  # Clean LevelDB database for fresh test state
  echo "Cleaning LevelDB database for fresh test state..."
  rm -rf "${ROOT_DIR}/server/ydb" "${ROOT_DIR}/ydb" 2>/dev/null || true
  mkdir -p "${ROOT_DIR}/server/ydb"
  echo "LevelDB database cleaned successfully"

  # Ensure server is built
  cd "${ROOT_DIR}/server"
  if [ ! -d node_modules ]; then
    echo "Installing server dependencies..."
    npm_config_proxy="" npm_config_https_proxy="" npm ci
  fi
  echo "Building server..."
  npm run build --silent 2>/dev/null || npm run build
  cd "${ROOT_DIR}"

  # Ensure PM2 is installed
  ensure_pm2

  # Check if Yjs server is already running via PM2
  if pm2 list 2>/dev/null | grep -q "yjs-server.*online"; then
    echo "Yjs server already running via PM2, restarting..."
    pm2 restart yjs-server
  else
    echo "Starting Yjs server via PM2..."
    pm2 start ecosystem.config.js --only yjs-server
  fi

  # Save PM2 state
  pm2 save

  # Wait for the Yjs server to be ready
  if ! wait_for_port ${TEST_YJS_PORT}; then
    echo "Warning: Yjs WebSocket server may not be ready on port ${TEST_YJS_PORT}"
    echo "Check logs with: pm2 logs yjs-server"
  else
    echo "Yjs WebSocket server is ready on port ${TEST_YJS_PORT}"
  fi
}

# Start Tinylicious server
start_tinylicious() {
  echo "Tinylicious is disabled on the Yjs branch. Skipping."
}

# Start API server using PM2
start_api_server() {
  echo "Starting API server on port ${TEST_API_PORT}..."

  # Ensure PM2 is installed
  ensure_pm2

  # Check if API server is already running via PM2
  if pm2 list 2>/dev/null | grep -q "api-server.*online"; then
    echo "API server already running via PM2, restarting..."
    pm2 restart api-server
  else
    echo "Starting API server via PM2..."
    pm2 start ecosystem.config.js --only api-server
  fi

  # Save PM2 state
  pm2 save

  echo "API server started on port ${TEST_API_PORT}"
}

# Start SvelteKit server using PM2
start_sveltekit_server() {
  echo "Starting SvelteKit server on port ${VITE_PORT}..."

  # Ensure PM2 is installed
  ensure_pm2

  # Check if SvelteKit server is already running via PM2
  if pm2 list 2>/dev/null | grep -q "sveltekit-server.*online"; then
    echo "SvelteKit server already running via PM2, restarting..."
    pm2 restart sveltekit-server
  else
    echo "Starting SvelteKit server via PM2..."
    pm2 start ecosystem.config.js --only sveltekit-server
  fi

  # Save PM2 state
  pm2 save

  echo "SvelteKit server started on port ${VITE_PORT}"
}

# Wait for all required ports
wait_for_all_ports() {
  local failed_ports=()
  for port in "${REQUIRED_PORTS[@]}"; do
    if ! wait_for_port ${port}; then
      failed_ports+=("${port}")
      echo "Warning: Port ${port} is not ready"
    fi
  done

  if [ ${#failed_ports[@]} -gt 0 ]; then
    echo "Warning: The following ports are not ready: ${failed_ports[*]}"
    echo "Some services may not be available"
    return 1
  fi

  return 0
}
