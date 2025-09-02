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
    npm --proxy='' --https-proxy='' install -g firebase-tools tinylicious dotenv-cli @dotenvx/dotenvx || true
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
    sudo apt-get update
    DEBIAN_FRONTEND=noninteractive sudo apt-get -y install --no-install-recommends openjdk-17-jre-headless
  else
    # Check Java version (Firebase requires Java 11+)
    java_version=$(java -version 2>&1 | head -n1 | cut -d'"' -f2 | cut -d'.' -f1)
    if [ "$java_version" -lt 11 ] 2>/dev/null; then
      echo "Java version $java_version is too old for Firebase. Installing OpenJDK 17..."
      sudo apt-get update
      DEBIAN_FRONTEND=noninteractive sudo apt-get -y install --no-install-recommends openjdk-17-jre-headless
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

  # Install Playwright browser (system dependencies should be handled by install_os_utilities)
  cd "${ROOT_DIR}/client"
  npx playwright install chromium || echo "Playwright install failed, continuing..."
  npx playwright install-deps chromium || echo "Playwright deps install failed, continuing..."

  cd "${ROOT_DIR}"
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

  # Normalize Firebase emulator host/ports to common-config values
  # This avoids mismatches caused by locally edited .env files.
  export FIREBASE_AUTH_EMULATOR_HOST="localhost:${FIREBASE_AUTH_PORT}"
  export FIRESTORE_EMULATOR_HOST="localhost:${FIREBASE_FIRESTORE_PORT}"
  export FIREBASE_EMULATOR_HOST="localhost:${FIREBASE_FUNCTIONS_PORT}"

  # Also align client-side Vite variables for emulator usage
  export VITE_FIREBASE_EMULATOR_HOST="localhost"
  export VITE_FIRESTORE_EMULATOR_PORT="${FIREBASE_FIRESTORE_PORT}"
  export VITE_AUTH_EMULATOR_PORT="${FIREBASE_AUTH_PORT}"
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

  # Development environment test dependencies
  cd "${ROOT_DIR}/scripts/tests"
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

  # Create .env file for Firebase Functions (without reserved environment variables)
  echo "Creating .env file for Firebase Functions..."
  cat > "${ROOT_DIR}/functions/.env" << EOF
AZURE_TENANT_ID=test-tenant-id
AZURE_ENDPOINT=https://test.fluidrelay.azure.com
AZURE_PRIMARY_KEY=test-primary-key
AZURE_SECONDARY_KEY=test-secondary-key
AZURE_ACTIVE_KEY=primary
EOF

  echo "Firebase Functions .env file contents:"
  cat "${ROOT_DIR}/functions/.env" || echo "Failed to read .env file"

  # Start Firebase emulator with detailed logging
  echo "Firebase emulator starting with project: ${FIREBASE_PROJECT_ID}"
  echo "Using config file: firebase.emulator.json"
  echo "Starting emulators: auth,firestore,functions,hosting,storage"
  firebase emulators:start --only auth,firestore,functions,hosting,storage --config firebase.emulator.json --project ${FIREBASE_PROJECT_ID} > "${ROOT_DIR}/server/logs/firebase-emulator.log" 2>&1 &
  FIREBASE_PID=$!
  echo "Firebase emulator started with PID: ${FIREBASE_PID}"
  echo "Firebase emulator log will be written to: ${ROOT_DIR}/server/logs/firebase-emulator.log"

  cd "${ROOT_DIR}"
  node "${ROOT_DIR}/server/scripts/init-firebase-emulator.js" &

  # Wait for Firebase emulator to start and verify it's working
  echo "Waiting for Firebase emulator to start..."
  for i in {1..60}; do
    if nc -z localhost ${FIREBASE_AUTH_PORT} >/dev/null 2>&1; then
      echo "Firebase Auth emulator is running on port ${FIREBASE_AUTH_PORT}"
      break
    fi
    echo "Waiting for Firebase Auth emulator... (attempt $i/60)"
    sleep 3
  done

  # Check if Firebase Functions emulator is running
  for i in {1..60}; do
    if nc -z localhost ${FIREBASE_FUNCTIONS_PORT} >/dev/null 2>&1; then
      echo "Firebase Functions emulator is running on port ${FIREBASE_FUNCTIONS_PORT}"
      break
    fi
    echo "Waiting for Firebase Functions emulator... (attempt $i/60)"
    sleep 3
  done

  # Check if Firebase Hosting emulator is running
  for i in {1..60}; do
    if nc -z localhost ${FIREBASE_HOSTING_PORT} >/dev/null 2>&1; then
      echo "Firebase Hosting emulator is running on port ${FIREBASE_HOSTING_PORT}"
      break
    fi
    echo "Waiting for Firebase Hosting emulator... (attempt $i/60)"
    sleep 3
  done

  # Additional wait for Firebase Functions to fully initialize
  echo "Waiting additional 10 seconds for Firebase Functions to fully initialize..."
  sleep 10

  # Test Firebase Functions endpoint directly
  echo "Testing Firebase Functions endpoint directly..."
  if curl -s -f "http://localhost:${FIREBASE_FUNCTIONS_PORT}/${FIREBASE_PROJECT_ID}/us-central1/health" >/dev/null 2>&1; then
    echo "Firebase Functions health endpoint is responding directly"
  else
    echo "WARNING: Firebase Functions health endpoint is not responding directly"
  fi

  # Test Firebase Hosting endpoint
  echo "Testing Firebase Hosting endpoint..."
  if curl -s -f "http://localhost:${FIREBASE_HOSTING_PORT}/api/health" >/dev/null 2>&1; then
    echo "Firebase Hosting health endpoint is responding"
  else
    echo "WARNING: Firebase Hosting health endpoint is not responding"
  fi

  # Test get-container-users endpoint
  echo "Testing get-container-users endpoint..."
  response=$(curl -s -w "%{http_code}" -o /dev/null -X POST -H "Content-Type: application/json" -d '{"idToken":"invalid-token","containerId":"test-container"}' "http://localhost:${FIREBASE_HOSTING_PORT}/api/get-container-users")
  echo "get-container-users endpoint returned HTTP status: $response"
  if [ "$response" = "401" ]; then
    echo "✅ get-container-users endpoint is working correctly (401 for invalid token)"
  else
    echo "❌ get-container-users endpoint returned unexpected status: $response"
    echo "Checking Firebase emulator log..."
    tail -30 "${ROOT_DIR}/server/logs/firebase-emulator.log" || echo "No Firebase emulator log found"
  fi

  # Test adminCheckForContainerUserListing endpoint
  echo "Testing adminCheckForContainerUserListing endpoint..."
  response=$(curl -s -w "%{http_code}" -o /dev/null -X POST -H "Content-Type: application/json" -d '{"idToken":"invalid-token","containerId":"test-container"}' "http://localhost:${FIREBASE_HOSTING_PORT}/api/adminCheckForContainerUserListing")
  echo "adminCheckForContainerUserListing endpoint returned HTTP status: $response"
  if [ "$response" = "401" ]; then
    echo "✅ adminCheckForContainerUserListing endpoint is working correctly (401 for invalid token)"
  else
    echo "❌ adminCheckForContainerUserListing endpoint returned unexpected status: $response"
    echo "Response body:"
    curl -s -X POST -H "Content-Type: application/json" -d '{"idToken":"invalid-token","containerId":"test-container"}' "http://localhost:${FIREBASE_HOSTING_PORT}/api/adminCheckForContainerUserListing" || echo "Failed to get response body"

    echo "Checking if Firebase Functions are loaded..."
    echo "Firebase emulator log (last 50 lines):"
    tail -50 "${ROOT_DIR}/server/logs/firebase-emulator.log" || echo "No Firebase emulator log found"

    echo "Checking Firebase Functions directly..."
    direct_response=$(curl -s -w "%{http_code}" -o /dev/null -X POST -H "Content-Type: application/json" -d '{"idToken":"invalid-token","containerId":"test-container"}' "http://localhost:${FIREBASE_FUNCTIONS_PORT}/${FIREBASE_PROJECT_ID}/us-central1/adminCheckForContainerUserListing")
    echo "Direct Firebase Functions call returned HTTP status: $direct_response"
  fi
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
  npx dotenvx run --env-file=.env.test -- npm --experimental-network-inspection run dev -- --host 0.0.0.0 --port ${TEST_API_PORT} </dev/null > "${ROOT_DIR}/server/logs/test-log-service-tee.log" 2>&1 &
  cd "${ROOT_DIR}"
}

# Start SvelteKit server
start_sveltekit_server() {
  echo "Starting SvelteKit server on port ${VITE_PORT}..."
  cd "${ROOT_DIR}/client"
  npx dotenvx run --env-file=.env.test -- npm --experimental-network-inspection run dev -- --host 0.0.0.0 --port ${VITE_PORT} </dev/null > "${ROOT_DIR}/server/logs/test-svelte-kit.log" 2>&1 &
  cd "${ROOT_DIR}"
}

# Start Yjs server
start_yjs_server() {
  echo "Starting Yjs server on port ${YJS_SERVER_PORT}..."
  cd "${ROOT_DIR}/yjs-server"

  # Install dependencies if needed
  if [ ! -d node_modules ]; then
    npm --proxy='' --https-proxy='' ci
  fi

  # Start the server with environment variables
  NODE_ENV=test \
  PORT=${YJS_SERVER_PORT} \
  HOST=0.0.0.0 \
  LOG_LEVEL=info \
  YPERSISTENCE="${ROOT_DIR}/yjs-server/test-yjs-data" \
  FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID} \
  USE_FIREBASE_EMULATOR=true \
  FIREBASE_AUTH_EMULATOR_HOST=localhost:${FIREBASE_AUTH_PORT} \
  FIRESTORE_EMULATOR_HOST=localhost:${FIREBASE_FIRESTORE_PORT} \
  FIREBASE_EMULATOR_HOST=localhost:${FIREBASE_FUNCTIONS_PORT} \
  npm start > "${ROOT_DIR}/server/logs/yjs-server.log" 2>&1 &
  YJS_PID=$!
  echo "Yjs server started with PID: ${YJS_PID}"
  cd "${ROOT_DIR}"
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
