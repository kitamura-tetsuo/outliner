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

# Whether OS packages can be installed at all.
#
# Sandboxed/cloud dev containers (Claude Code on the web, Codespaces-style
# images) usually run behind an egress proxy that rejects the distro mirrors, so
# every `apt-get update` fails on a third-party PPA even though the image
# already ships the packages the tests need. Probe once, cache the answer, and
# let callers degrade to a warning instead of aborting the whole setup.
# Set SKIP_APT_INSTALL=1 to force the degraded path without probing.
APT_AVAILABLE_CACHE=""
apt_is_available() {
  if [ "${SKIP_APT_INSTALL:-0}" = "1" ]; then
    return 1
  fi
  if [ -n "$APT_AVAILABLE_CACHE" ]; then
    [ "$APT_AVAILABLE_CACHE" = "yes" ]
    return
  fi
  if ! command -v apt-get >/dev/null 2>&1 || ! command -v sudo >/dev/null 2>&1; then
    APT_AVAILABLE_CACHE="no"
    return 1
  fi
  if sudo apt-get -o Acquire::Retries=1 -o Acquire::http::Timeout=15 -o Acquire::ForceIPv4=true update >/dev/null 2>&1; then
    APT_AVAILABLE_CACHE="yes"
    return 0
  fi
  echo "Warning: apt-get update failed (offline or proxied environment); skipping OS package installation."
  echo "         Set SKIP_APT_INSTALL=1 to silence this probe."
  APT_AVAILABLE_CACHE="no"
  return 1
}

# Run apt-get with automatic retry and dpkg repair to handle transient failures
retry_apt_get() {
  local attempts=0
  local max_attempts=3
  while true; do
    if sudo apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=20 -o Acquire::ForceIPv4=true "$@"; then
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


# Make sure the pre-commit that git will actually run is new enough for
# .pre-commit-config.yaml, whose stages use the names introduced in 3.2
# ("pre-commit" / "pre-push"). An older release rejects the whole config with
# InvalidConfigError, so every commit fails before a hook runs — and a
# distro-packaged pre-commit earlier on PATH can shadow the one setup just
# installed, hence checking the resolved binary rather than the install itself.
# Never fails the caller: setup.sh runs under `set -e` with a retry trap.
ensure_pre_commit_version() {
  local minimum="${PRE_COMMIT_MIN_VERSION:-3.2.0}"

  local resolved
  resolved="$(pre-commit --version 2>/dev/null | awk '{print $2}' || true)"

  # Older than required (or absent): try once to upgrade the active environment.
  if [ -z "$resolved" ] || [ "$(printf '%s\n%s\n' "$minimum" "$resolved" | sort -V | head -n1)" != "$minimum" ]; then
    echo "pre-commit ${resolved:-<missing>} is older than the required ${minimum}; upgrading..."
    python3 -m pip install --no-cache-dir --upgrade "pre-commit>=${minimum}" || true
    resolved="$(pre-commit --version 2>/dev/null | awk '{print $2}' || true)"
  fi

  if [ -z "$resolved" ]; then
    echo "Warning: pre-commit is not on PATH; commit hooks will not run."
    echo "         Install it with: python3 -m pip install 'pre-commit>=${minimum}'"
    return 0
  fi

  if [ "$(printf '%s\n%s\n' "$minimum" "$resolved" | sort -V | head -n1)" != "$minimum" ]; then
    echo "Warning: pre-commit ${resolved} cannot parse .pre-commit-config.yaml (needs >= ${minimum})."
    echo "         It fails with InvalidConfigError on the 'pre-commit' stage names."
    echo "         Upgrade it with: python3 -m pip install --upgrade 'pre-commit>=${minimum}'"
    return 0
  fi

  echo "pre-commit ${resolved} satisfies the required ${minimum}"
  return 0
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

# Ensure JDK 21 is available locally
ensure_jdk_21() {
  local jdk_dir="${ROOT_DIR}/.jdk"
  local version_target=21

  if [ -x "${jdk_dir}/bin/java" ]; then
    local current_v=$("${jdk_dir}/bin/java" -version 2>&1 | head -n1 | cut -d'"' -f2 | cut -d'.' -f1)
    if [ "$current_v" -ge "$version_target" ] 2>/dev/null; then
      echo "Local JDK ${current_v} found at ${jdk_dir}"
      export JAVA_HOME="${jdk_dir}"
      export PATH="${JAVA_HOME}/bin:$PATH"
      return 0
    fi
  fi

  echo "Installing OpenJDK 21 to ${jdk_dir}..."
  mkdir -p "${jdk_dir}"
  
  # Determine architecture
  local arch=$(uname -m)
  local download_url=""
  if [ "$arch" = "x86_64" ]; then
    download_url="https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.6%2B7/OpenJDK21U-jre_x64_linux_hotspot_21.0.6_7.tar.gz"
  elif [ "$arch" = "aarch64" ]; then
    download_url="https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.6%2B7/OpenJDK21U-jre_aarch64_linux_hotspot_21.0.6_7.tar.gz"
  else
    echo "Unsupported architecture: $arch"
    return 1
  fi

  local tmp_tar="/tmp/openjdk21.tar.gz"
  curl -L -o "$tmp_tar" "$download_url"
  
  # Extract and move contents to .jdk without the nested top-level folder
  local tmp_extract="/tmp/jdk_extract"
  mkdir -p "$tmp_extract"
  tar -xzf "$tmp_tar" -C "$tmp_extract"
  
  # Move the contents of the (only) child directory to .jdk
  local subdir=$(ls "$tmp_extract")
  rm -rf "${jdk_dir:?}"/*
  cp -R "${tmp_extract}/${subdir}"/* "${jdk_dir}/"
  
  # Cleanup
  rm -rf "$tmp_extract" "$tmp_tar"
  
  export JAVA_HOME="${jdk_dir}"
  export PATH="${JAVA_HOME}/bin:$PATH"
  
  echo "OpenJDK 21 installed successfully to ${jdk_dir}"
}

# Install OS utilities if needed
install_os_utilities() {
  # Check if Java is installed and compatible with Firebase
  if ! command -v java >/dev/null 2>&1; then
    echo "Java not found. Ensuring JDK 21..."
    ensure_jdk_21
  else
    # Check Java version (Firebase requires Java 21+)
    java_version=$(java -version 2>&1 | head -n1 | cut -d'"' -f2 | cut -d'.' -f1)
    if [ "$java_version" -lt 21 ] 2>/dev/null; then
      echo "Java version $java_version is too old for Firebase (needs 21+). Ensuring JDK 21..."
      ensure_jdk_21
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
    if apt_is_available; then
      DEBIAN_FRONTEND=noninteractive retry_apt_get -y install --no-install-recommends \
        "${original_deps[@]}" \
        "${playwright_deps[@]}" \
        "${CANVAS_NATIVE_DEPS[@]}"
    else
      echo "Skipping OS utility installation; relying on packages already present in the image."
    fi
  fi

  ensure_playwright_browsers
}

# Make a Chromium build available to Playwright.
#
# Normally this is just `playwright install chromium`. When the browser CDN is
# unreachable (sandboxes commonly allow only the npm registry), fall back to a
# Chromium that is already baked into the image and record its path in
# .playwright-chromium-path, which client/playwright.config.ts reads and passes
# as launchOptions.executablePath. PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH overrides
# both.
PLAYWRIGHT_BROWSERS_RESOLVED=""

# The @playwright/test version resolved in client/package-lock.json, i.e. the
# one the E2E suite runs with. Empty when it cannot be read.
playwright_pinned_version() {
  node -p "require('${ROOT_DIR}/client/package-lock.json').packages['node_modules/@playwright/test'].version" 2>/dev/null || true
}

ensure_playwright_browsers() {
  local marker="${ROOT_DIR}/.playwright-chromium-path"

  # setup.sh reaches this through both install_os_utilities and its own explicit
  # call; resolving once per run keeps a blocked download from being retried.
  if [ -n "$PLAYWRIGHT_BROWSERS_RESOLVED" ]; then
    return 0
  fi

  cd "${ROOT_DIR}/client"

  # Pin the CLI to the Playwright the tests actually run with. An unpinned
  # `npx --yes playwright` fetches the newest release, and `install` prunes
  # every browser outside that release's registry -- so a newer Playwright on
  # npm silently deletes the revision @playwright/test needs and installs one
  # it cannot use, breaking every E2E shard with "Executable doesn't exist".
  local pinned
  pinned="$(playwright_pinned_version)"
  local cli="playwright"
  if [ -n "$pinned" ]; then
    cli="playwright@${pinned}"
  else
    echo "Warning: could not read the pinned Playwright version; falling back to the latest CLI." >&2
  fi

  echo "Installing Playwright chromium (${cli})..."
  if PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0 npx --yes "$cli" install chromium; then
    rm -f "$marker"
    PLAYWRIGHT_BROWSERS_RESOLVED="download"
    if apt_is_available; then
      echo "Installing Playwright dependencies..."
      npx --yes "$cli" install-deps chromium || echo "Playwright deps install failed, continuing..."
    fi
    cd "${ROOT_DIR}"
    return 0
  fi

  echo "Playwright browser download failed; looking for a pre-installed Chromium..."
  local candidate=""
  for path in \
    "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" \
    "${PLAYWRIGHT_BROWSERS_PATH:-}/chromium" \
    "${PLAYWRIGHT_BROWSERS_PATH:-}"/chromium-*/chrome-linux/chrome \
    /usr/bin/chromium \
    /usr/bin/chromium-browser \
    /usr/bin/google-chrome; do
    if [ -n "$path" ] && [ -x "$path" ]; then
      candidate="$path"
      break
    fi
  done

  cd "${ROOT_DIR}"
  if [ -z "$candidate" ]; then
    echo "Error: no Chromium available for Playwright (download blocked and none pre-installed)." >&2
    return 1
  fi

  echo "Using pre-installed Chromium: ${candidate}"
  printf '%s\n' "$candidate" > "$marker"
  PLAYWRIGHT_BROWSERS_RESOLVED="preinstalled"
  return 0
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
    if apt_is_available; then
      DEBIAN_FRONTEND=noninteractive retry_apt_get -y install --no-install-recommends "${missing[@]}"
    else
      echo "Skipping node-canvas native dependencies (${missing[*]}); install them manually if canvas fails to build."
    fi
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

  # The client and server both compile ../shared/src, whose bare yjs/uuid/
  # yjs-orderedtree imports must resolve. Point shared/node_modules at a
  # consumer's already-installed node_modules via a symlink — offline-safe (no
  # registry access) and never a build-time dependency install.
  #
  # Prefer the CLIENT: `vite dev` serves shared/src as source and resolves its
  # bare imports through this link, so it MUST land on the exact yjs the client
  # already pre-bundled — otherwise Vite treats shared/src's yjs as a new dep,
  # re-optimizes mid-run and reloads the live page (tearing out outliner-base
  # under an in-flight e2e seed). This is forced (ln -sfn) rather than
  # create-if-absent because the CI container bakes the link at image-build time
  # and skips npm ci at runtime, so a create-if-absent guard would never correct
  # a stale/ server-pointing link. Fall back to the server only when the client
  # is not installed (server-only image), which is all the server's tsc needs.
  if [ -f "${ROOT_DIR}/shared/package.json" ]; then
    if [ -d "${ROOT_DIR}/client/node_modules" ]; then
      echo "Linking shared/node_modules -> client/node_modules"
      ln -sfn ../client/node_modules "${ROOT_DIR}/shared/node_modules" || echo "shared link skipped"
    elif [ -d "${ROOT_DIR}/server/node_modules" ] \
      && [ ! -e "${ROOT_DIR}/shared/node_modules" ]; then
      echo "Linking shared/node_modules -> server/node_modules"
      ln -s ../server/node_modules "${ROOT_DIR}/shared/node_modules" || echo "shared link skipped"
    fi
  fi

  cd "${ROOT_DIR}/server"
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
