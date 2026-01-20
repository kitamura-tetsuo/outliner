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
    if id "node" >/dev/null 2>&1; then
      echo "Fixing node_modules ownership before npm install..."
      sudo chown -R node:node "node_modules" || true
    fi
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


# Install global packages if needed
install_global_packages() {
  if ! command -v firebase >/dev/null || ! command -v tinylicious >/dev/null || ! command -v pm2 >/dev/null; then
    echo "Installing global packages (firebase-tools, tinylicious, pm2)..."
    npm_config_proxy="" npm_config_https_proxy="" npm install -g firebase-tools tinylicious pm2 dotenv-cli @dotenvx/dotenvx || true
    # Refresh PATH to include newly installed global packages
    NPM_GLOBAL_BIN="$(npm bin -g 2>/dev/null || true)"
    if [ -n "$NPM_GLOBAL_BIN" ] && [[ ":$PATH:" != *":$NPM_GLOBAL_BIN:"* ]]; then
      export PATH="$NPM_GLOBAL_BIN:$PATH"
    fi
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
VITE_FIREBASE_EMULATOR_HOST=127.0.0.1
VITE_USE_TINYLICIOUS=true
VITE_HOST=127.0.0.1
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
  # Do not copy to .env for functions, as firebase-functions tries to load it automatically
  # and might fail or conflict with index.js manual loading of .env.test
  # if [ ! -f "${ROOT_DIR}/functions/.env" ]; then
  #   cp "${ROOT_DIR}/functions/.env.test" "${ROOT_DIR}/functions/.env"
  #   echo "Created functions/.env"
  # fi

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
          if id "node" >/dev/null 2>&1; then
            echo "Fixing node_modules ownership in $dir..."
            sudo chown -R node:node "${dir}/node_modules" || true
          fi
        fi
        # Ensure directory is owned by node user
        if [ "$(stat -c %U $dir)" = "root" ]; then
          if id "node" >/dev/null 2>&1; then
            echo "Fixing ownership for $dir..."
            sudo chown -R node:node "$dir" || true
          fi
        fi
      fi
    done
  else
    echo "Skipping permission fixes in CI environment."
  fi

  # Server dependencies
  cd "${ROOT_DIR}/server"
  npm_ci_if_needed
  if [ "${SKIP_BUILD:-0}" -ne 1 ]; then
    echo "Building server..."
    npm run build
  else
    echo "Skipping server build (SKIP_BUILD=1)"
  fi

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
