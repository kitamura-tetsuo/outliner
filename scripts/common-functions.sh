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

# Ceiling (seconds) for any single readiness observation inside
# start_and_wait_for_services. Individual probes must never hold the gate
# past its wall-clock deadline when an endpoint accepts a connection and
# then never responds (issue #5486).
E2E_PROBE_TIMEOUT_SECONDS=5

# Remaining seconds before the readiness deadline timestamp $1.
_readiness_remaining() {
  local deadline="$1"
  local now
  now=$(date +%s)
  echo $((deadline - now))
}

# Per-probe timeout clamped to the remaining budget: at least 1s so a
# nearly-expired deadline still fails fast instead of skipping the probe,
# at most E2E_PROBE_TIMEOUT_SECONDS so a hung endpoint cannot overrun it.
_probe_timeout() {
  local deadline="$1"
  if [ "$deadline" -le 0 ]; then
    echo "${E2E_PROBE_TIMEOUT_SECONDS:-5}"
    return
  fi
  local remaining
  remaining=$(_readiness_remaining "$deadline")
  if [ "$remaining" -lt 1 ]; then
    echo 1
  elif [ "$remaining" -gt "${E2E_PROBE_TIMEOUT_SECONDS:-5}" ]; then
    echo "${E2E_PROBE_TIMEOUT_SECONDS:-5}"
  else
    echo "$remaining"
  fi
}

# True when the wall-clock timestamp $1 (seconds since epoch) has reached
# the readiness deadline. Every observation consults this first so an
# already-expired phase fails immediately instead of consuming another
# probe interval past the budget (issue #5486).
_deadline_expired() {
  [ "$(date +%s)" -ge "$1" ]
}

# Run "$@" bounded by $1 seconds (issue #5486, REQ-002). Prefers GNU timeout
# with a forced kill shortly after the limit so a command that ignores
# SIGTERM still returns. A non-positive limit means the budget is already
# exhausted: fail immediately without running the command (a zero duration
# would mean "no limit" to GNU timeout). Without GNU timeout the same hard
# bound is enforced with a watchdog that escalates TERM to KILL, so no
# observation can hold the gate indefinitely. E2E_FORCE_NO_TIMEOUT=1 forces
# the watchdog path (test hook for images without timeout support).
_run_bounded() {
  local limit="$1"
  shift
  if ! [[ "$limit" =~ ^[0-9]+$ ]] || [ "$limit" -le 0 ]; then
    return 124
  fi
  if [ "${E2E_FORCE_NO_TIMEOUT:-0}" != "1" ] && command -v timeout >/dev/null 2>&1; then
    timeout --kill-after=2 "$limit" "$@"
    return
  fi
  "$@" &
  local _pid=$!
  ( sleep "$limit"; kill -TERM "$_pid" 2>/dev/null || true; sleep 2; kill -KILL "$_pid" 2>/dev/null || true ) &
  local _watch=$!
  wait "$_pid"
  local _rc=$?
  kill "$_watch" 2>/dev/null || true
  wait "$_watch" 2>/dev/null || true
  return "$_rc"
}

# Per-fallback probe limit for a deadline-bound port_is_open sequence
# (issue #5487, REQ-005). Like _probe_timeout, but additionally reserves
# the 2s forced-termination grace used by _run_bounded, so even a probe
# that ignores SIGTERM is reaped within the remaining budget instead of
# carrying the gate past it. Floored at 1s so a nearly-expired deadline
# still fails fast instead of skipping the probe; callers re-check expiry
# before every fallback, so once the deadline passes no fallback starts.
_fallback_probe_limit() {
  local deadline="$1"
  local remaining
  remaining=$(_readiness_remaining "$deadline")
  local limit=$((remaining - 2))
  if [ "$limit" -gt "${E2E_PROBE_TIMEOUT_SECONDS:-5}" ]; then
    limit="${E2E_PROBE_TIMEOUT_SECONDS:-5}"
  fi
  if [ "$limit" -lt 1 ]; then
    limit=1
  fi
  echo "$limit"
}

# Quick check: is a port open without waiting (no dependency on nc).
# Pass the readiness deadline timestamp as $2 when called from the
# startup gate so each probe stays within the remaining budget. The
# deadline is re-checked before every fallback probe and each fallback
# timeout is recomputed from the time still left, so once the deadline
# expires no further fallback may start (issue #5487, REQ-005).
port_is_open() {
  local port="$1"
  local deadline="${2:-0}"
  local probe_timeout="${E2E_PROBE_TIMEOUT_SECONDS:-5}"
  if [ "$deadline" -gt 0 ]; then
    # Already past the deadline: report unready at once instead of spending
    # another probe interval (which would carry the gate past its budget).
    if _deadline_expired "$deadline"; then
      return 1
    fi
    probe_timeout=$(_fallback_probe_limit "$deadline")
  fi
  if _run_bounded "$probe_timeout" nc -w 2 -z 127.0.0.1 "${port}" >/dev/null 2>&1; then
    return 0
  fi
  # The curl fallback must not start past the deadline: the nc probe above
  # may have consumed the rest of the budget.
  if [ "$deadline" -gt 0 ]; then
    if _deadline_expired "$deadline"; then
      return 1
    fi
    probe_timeout=$(_fallback_probe_limit "$deadline")
  fi
  if _run_bounded "$probe_timeout" curl -s --connect-timeout 2 --max-time "$probe_timeout" "http://127.0.0.1:${port}/" >/dev/null 2>&1; then
    return 0
  fi
  # The lsof fallback is an observation like the others: it runs inside a
  # hard bound so a wedged lsof cannot hold the gate (issue #5486), and it
  # never starts once the deadline has expired (issue #5487, REQ-005).
  if [ "$deadline" -gt 0 ] && _deadline_expired "$deadline"; then
    return 1
  fi
  if [ "$deadline" -gt 0 ]; then
    probe_timeout=$(_fallback_probe_limit "$deadline")
  fi
  if command -v lsof >/dev/null 2>&1 && _run_bounded "$probe_timeout" lsof -i ":${port}" >/dev/null 2>&1; then
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

# Start the PM2-managed test services (yjs-server, log-service, vite-server,
# firebase-emulators) and block until they report ready, then initialize the
# Firebase emulator (test users, etc.). Shared by scripts/setup.sh (developer
# machines / the container-image bake) and scripts/ci-e2e-start.sh (the
# minimal CI E2E startup path) so the readiness logic only lives once.
# Honors SKIP_SERVER_START=1 to no-op, matching setup.sh's existing behavior.
start_and_wait_for_services() {
  if [ "${SKIP_SERVER_START:-0}" -eq 1 ]; then
    echo "Skipping server start as requested"
    return 0
  fi

  # Single wall-clock budget for one startup attempt (issue #5486): 180s
  # preserves the observed successful envelope (slowest success 151s on
  # 2026-10-07, which recovered via the hosting-stall retry below) with
  # margin. Overridable for tests via E2E_SERVICE_READINESS_TIMEOUT_SECONDS;
  # nothing inside this phase may extend or reset it. The clock starts before
  # supervision (pm2 start) so a wedged daemon cannot hold the phase outside
  # the budget.
  local MAX_WAIT_SECONDS="${E2E_SERVICE_READINESS_TIMEOUT_SECONDS:-180}"
  local START_TIME
  START_TIME=$(date +%s)
  local DEADLINE=$((START_TIME + MAX_WAIT_SECONDS))
  # Last unsatisfied-check summary, refreshed by every readiness evaluation
  # so the deadline failure can identify them without re-probing past it.
  # Per-owner missing-check summaries (OWNER_MISSING_<KEY> below) feed the
  # stall tracker and the deadline diagnostics with the same evaluation.
  LAST_READINESS_MISSING=""
  OWNER_MISSING_YJS=""
  OWNER_MISSING_LOG=""
  OWNER_MISSING_VITE=""
  OWNER_MISSING_EMU=""
  # Automatic recovery state for crashed or stalled services (issue #5487).
  # A required PM2 service that is positively observed in a terminal or
  # non-starting state, or that stays online/launching while its owned
  # readiness checks remain continuously unsatisfied for STALL_THRESHOLD
  # seconds, is restarted once. The threshold is overridable for tests via
  # E2E_SERVICE_STALL_SECONDS (default 60s — substantial margin above the
  # observed normal startup envelope, clustered below 30s). Restarts never
  # extend or reset DEADLINE, and each owning service restarts at most once
  # per startup attempt. The legacy Hosting-only retry (issue #5453) is
  # generalized by this single restart path, so one recovery episode can
  # never trigger both an old and a new restart for firebase-emulators.
  local STALL_THRESHOLD="${E2E_SERVICE_STALL_SECONDS:-60}"
  case "$STALL_THRESHOLD" in
    ''|*[!0-9]*|0) STALL_THRESHOLD=60 ;;
  esac
  local RESTARTED_YJS=0 RESTARTED_LOG=0 RESTARTED_VITE=0 RESTARTED_EMU=0
  local STALL_SINCE_YJS=0 STALL_SINCE_LOG=0 STALL_SINCE_VITE=0 STALL_SINCE_EMU=0
  local RECOVERY_FAILED=false

  echo "Starting PM2-managed services (yjs-server, log-service, vite-server, firebase-emulators)..."
  # Bounded so a wedged pm2 daemon cannot hold supervision start past the
  # deadline; a start that cannot be confirmed is a startup failure, never
  # silent success.
  if ! _run_bounded "$MAX_WAIT_SECONDS" pm2 start "${ROOT_DIR}/ecosystem.config.cjs"; then
    echo "Failed to start PM2-managed services (pm2 start did not complete within ${MAX_WAIT_SECONDS}s)."
    echo "Readiness checks still unsatisfied: ${LAST_READINESS_MISSING:-PM2 supervision start (pm2 start unsuccessful)}"
    if _deadline_expired "$DEADLINE"; then
      echo "Post-deadline process diagnostics skipped: the single ${MAX_WAIT_SECONDS}s wall-clock budget is already exhausted."
    else
      echo "State of services:"
      _run_bounded "$(_probe_timeout "$DEADLINE")" pm2 list || true
      echo "--- PM2 Logs (tail) ---"
      _run_bounded "$(_probe_timeout "$DEADLINE")" pm2 logs --lines 50 --nostream || true
    fi
    exit 1
  fi

  # Loop to check services and ports in parallel
  echo "Waiting for services to be ready (checking PM2 status and ports in parallel)..."

  # PM2 process-state snapshot (issues #5486 REQ-003, #5487 REQ-001/REQ-003).
  # Returns 0 only when every required process is positively observed in
  # an acceptable state (online/launching). Returns 1 when at least one
  # required process is positively observed missing or in a terminal /
  # non-starting state; those are listed in PM2_BAD_SERVICES as
  # "name:status" lines ("missing" when the process is absent). Returns 2
  # for any unavailable observation (pm2 failure, malformed JSON, timeout,
  # or an already-expired deadline) so unavailable process-state evidence
  # can never satisfy the gate — and, per REQ-001, can never trigger a
  # restart either, since only positive evidence names a service to
  # restart. Bounded so a wedged pm2 daemon cannot hold the gate past
  # DEADLINE.
  PM2_BAD_SERVICES=""
  _pm2_status_snapshot() {
    PM2_BAD_SERVICES=""
    if _deadline_expired "$DEADLINE"; then
      return 2
    fi
    local _pm2_probe
    _pm2_probe=$(_probe_timeout "$DEADLINE")
    local _out=""

    # The command substitution deliberately swallows the probe body: only
    # BAD: lines count as positive evidence, and the caller reports them.
    # Diagnostics from other output are echoed by the failure handlers.
    if ! _out=$(PM2_JLIST_TIMEOUT_MS=$((_pm2_probe * 1000)) _run_bounded "$_pm2_probe" node -e '
      try {
        const exec = require("child_process").execSync;
        const ms = parseInt(process.env.PM2_JLIST_TIMEOUT_MS || "4000", 10);
        const list = JSON.parse(exec("pm2 jlist", { timeout: ms }).toString());
        if (!Array.isArray(list)) {
          console.log("Error: pm2 jlist did not return a process list");
          process.exit(1);
        }
        const apps = ["yjs-server", "log-service", "vite-server", "firebase-emulators"];
        const byName = new Map();
        for (const p of list) {
          if (p && typeof p.name === "string") byName.set(p.name, p);
        }
        let failed = false;
        for (const name of apps) {
          const p = byName.get(name);
          if (!p) {
            console.log(`BAD:${name}:missing`);
            failed = true;
          } else {
            const st = p.pm2_env && p.pm2_env.status;
            if (st !== "online" && st !== "launching") {
              console.log(`BAD:${name}:${st}`);
              failed = true;
            }
          }
        }
        if (failed) process.exit(1);
      } catch (e) {
        console.error("Failed to check PM2 status:", e && e.message);
        process.exit(1);
      }
    ' 2>&1); then
      PM2_BAD_SERVICES=$(printf '%s\n' "$_out" | grep '^BAD:' | sed 's/^BAD://' || true)
      if [ -n "$PM2_BAD_SERVICES" ]; then
        printf '%s\n' "$_out" | grep -v '^BAD:' || true
        return 1
      fi
      if [ -n "$_out" ]; then
        printf '%s\n' "$_out"
      fi
      return 2
    fi
    return 0
  }

  # The single explicit table from readiness responsibility to owning PM2
  # service (issue #5487, REQ-003). Owner keys: yjs (yjs-server, including
  # the Yjs WebSocket check on its port), log (log-service), vite
  # (vite-server), emu (firebase-emulators, including every emulator port
  # and the Firebase Functions health check). No required readiness check
  # is restart-ineligible: every port maps to exactly one owner.
  _owner_of_port() {
    local _p="$1"
    if [ -n "${TEST_YJS_PORT:-}" ] && [ "$_p" = "$TEST_YJS_PORT" ]; then echo yjs; return; fi
    if [ -n "${TEST_API_PORT:-}" ] && [ "$_p" = "$TEST_API_PORT" ]; then echo log; return; fi
    if [ -n "${VITE_PORT:-}" ] && [ "$_p" = "$VITE_PORT" ]; then echo vite; return; fi
    echo emu
  }

  _owner_pm2_name() {
    case "$1" in
      yjs) echo "yjs-server" ;;
      log) echo "log-service" ;;
      vite) echo "vite-server" ;;
      emu) echo "firebase-emulators" ;;
    esac
  }

  _pm2_owner_key() {
    case "$1" in
      yjs-server) echo yjs ;;
      log-service) echo log ;;
      vite-server) echo vite ;;
      firebase-emulators) echo emu ;;
    esac
  }

  _owner_restarted() {
    case "$1" in
      yjs) [ "$RESTARTED_YJS" -eq 1 ] ;;
      log) [ "$RESTARTED_LOG" -eq 1 ] ;;
      vite) [ "$RESTARTED_VITE" -eq 1 ] ;;
      emu) [ "$RESTARTED_EMU" -eq 1 ] ;;
    esac
  }

  _mark_owner_restarted() {
    # A restart also resets the service's stall clock: the stall policy
    # measures continuous un-readiness after the service was started or
    # last restarted (REQ-002).
    case "$1" in
      yjs) RESTARTED_YJS=1; STALL_SINCE_YJS=-1 ;;
      log) RESTARTED_LOG=1; STALL_SINCE_LOG=-1 ;;
      vite) RESTARTED_VITE=1; STALL_SINCE_VITE=-1 ;;
      emu) RESTARTED_EMU=1; STALL_SINCE_EMU=-1 ;;
    esac
  }

  # Restart one owning PM2 service exactly once per startup attempt and
  # continue readiness evaluation within the same DEADLINE (REQ-004). The
  # restart itself is bounded by the remaining budget so a wedged pm2
  # daemon cannot hold recovery past the deadline (AS-007); a restart that
  # hangs or fails is a warning, not a loop — the gate keeps evaluating
  # and still fails at DEADLINE when the service stays unready (REQ-005).
  _restart_owner_service() {
    local _owner="$1"
    local _reason="$2"
    local _svc
    _svc=$(_owner_pm2_name "$_owner")
    if _deadline_expired "$DEADLINE"; then
      _fail_deadline
    fi
    echo "${_reason} Restarting ${_svc} once..."
    if _run_bounded "$(_probe_timeout "$DEADLINE")" pm2 restart "$_svc"; then
      echo "Restarted ${_svc} (automatic recovery); continuing readiness evaluation within the same ${MAX_WAIT_SECONDS}s deadline."
    else
      echo "Warning: pm2 restart ${_svc} failed; startup cannot succeed in this attempt."
      RECOVERY_FAILED=true
    fi
    _mark_owner_restarted "$_owner"
  }

  # Generic stall recovery (REQ-002, REQ-007): for every owner whose checks
  # from the latest readiness evaluation remain unsatisfied, track how
  # long they have been continuously unsatisfied (stall requires
  # continuity — a satisfied evaluation resets the clock). Restart only
  # owners continuously unready for STALL_THRESHOLD seconds; owners whose
  # checks are satisfied are never restarted.
  _evaluate_owner_stalls() {
    local _elapsed="$1"
    local _owner _missing _since
    for _owner in yjs log vite emu; do
      case "$_owner" in
        yjs) _missing="$OWNER_MISSING_YJS" ;;
        log) _missing="$OWNER_MISSING_LOG" ;;
        vite) _missing="$OWNER_MISSING_VITE" ;;
        emu) _missing="$OWNER_MISSING_EMU" ;;
      esac
      if [ -z "$_missing" ]; then
        case "$_owner" in
          yjs) STALL_SINCE_YJS=-1 ;;
          log) STALL_SINCE_LOG=-1 ;;
          vite) STALL_SINCE_VITE=-1 ;;
          emu) STALL_SINCE_EMU=-1 ;;
        esac
        continue
      fi
      case "$_owner" in
        yjs) _since="$STALL_SINCE_YJS" ;;
        log) _since="$STALL_SINCE_LOG" ;;
        vite) _since="$STALL_SINCE_VITE" ;;
        emu) _since="$STALL_SINCE_EMU" ;;
      esac
      if [ "$_since" -lt 0 ]; then
        case "$_owner" in
          yjs) STALL_SINCE_YJS="$_elapsed" ;;
          log) STALL_SINCE_LOG="$_elapsed" ;;
          vite) STALL_SINCE_VITE="$_elapsed" ;;
          emu) STALL_SINCE_EMU="$_elapsed" ;;
        esac
      elif ! _owner_restarted "$_owner" && [ $((_elapsed - _since)) -ge "$STALL_THRESHOLD" ]; then
        if _deadline_expired "$DEADLINE"; then
          _fail_deadline
        fi
        _restart_owner_service "$_owner" "Service $(_owner_pm2_name "$_owner") still unready after $((_elapsed - _since))s (missing: ${_missing})."
      fi
    done
  }

  _is_service_ready() {
    local verbose="${1:-false}"
    local deadline="${2:-0}"
    local all_ready=true
    local missing_services=()
    # Fresh per-owner attribution for this evaluation (issue #5487,
    # REQ-002/REQ-003): every unsatisfied check names its owning service so
    # stall recovery restarts exactly the affected owner.
    OWNER_MISSING_YJS=""
    OWNER_MISSING_LOG=""
    OWNER_MISSING_VITE=""
    OWNER_MISSING_EMU=""
    _record_owner_missing() {
      case "$1" in
        yjs) OWNER_MISSING_YJS="${OWNER_MISSING_YJS}${OWNER_MISSING_YJS:+ }${2}" ;;
        log) OWNER_MISSING_LOG="${OWNER_MISSING_LOG}${OWNER_MISSING_LOG:+ }${2}" ;;
        vite) OWNER_MISSING_VITE="${OWNER_MISSING_VITE}${OWNER_MISSING_VITE:+ }${2}" ;;
        emu) OWNER_MISSING_EMU="${OWNER_MISSING_EMU}${OWNER_MISSING_EMU:+ }${2}" ;;
      esac
    }

    # Check all required ports. The deadline is re-checked before every
    # probe and each probe timeout is recomputed from the time still left,
    # so a long port list cannot accumulate stale per-probe budgets past it.
    for port in "${REQUIRED_PORTS[@]}"; do
      if [ "$deadline" -gt 0 ] && _deadline_expired "$deadline"; then
        all_ready=false
        missing_services+=("Readiness deadline exceeded during port checks")
        break
      fi
      if ! port_is_open "${port}" "$deadline"; then
        all_ready=false
        missing_services+=("Port ${port}")
        _record_owner_missing "$(_owner_of_port "${port}")" "Port ${port}"
      fi
    done

    # Check Firebase Functions API Health (Directly via Functions Emulator)
    # Checks http://127.0.0.1:57070/outliner-d57b0/us-central1/health
    # We use direct URL because Hosting Emulator rewrite sometimes duplicates paths causing 404
    # Bounded: the health endpoint may accept the connection and then never
    # respond, which previously wedged the whole gate inside this iteration.
    # The curl exit status is decisive: curl can still print a 200 status
    # code captured before a body-transfer timeout, so a timed-out health
    # observation must never count as ready (issue #5486, REQ-003).
    if [ "$deadline" -le 0 ] || ! _deadline_expired "$deadline"; then
      if port_is_open "${FIREBASE_FUNCTIONS_PORT}" "$deadline"; then
         # Default project ID if not set
         local PROJECT_ID="${FIREBASE_PROJECT_ID:-outliner-d57b0}"
         local FUNC_URL="http://127.0.0.1:${FIREBASE_FUNCTIONS_PORT}/${PROJECT_ID}/us-central1/health"

         local HTTP_CODE
         local _fn_probe
         _fn_probe=$(_probe_timeout "$deadline")
         if HTTP_CODE=$(_run_bounded "$_fn_probe" curl -s --connect-timeout 2 --max-time "$_fn_probe" -o /dev/null -w "%{http_code}" "$FUNC_URL" 2>/dev/null); then
           if [ -z "$HTTP_CODE" ]; then
             HTTP_CODE="000"
           fi
         else
           HTTP_CODE="000"
         fi
         if [ "$HTTP_CODE" != "200" ]; then
           all_ready=false
           local MSG="Firebase Function Health [Code: $HTTP_CODE] (URL: $FUNC_URL)"
           _record_owner_missing "emu" "Firebase Function Health [Code: $HTTP_CODE]"
           if [ "$verbose" = "true" ]; then
              # Capture start of body for debugging
              local BODY
              local _body_probe
              _body_probe=$(_probe_timeout "$deadline")
              BODY=$(_run_bounded "$_body_probe" curl -s --connect-timeout 2 --max-time "$_body_probe" "$FUNC_URL" 2>/dev/null | head -c 200 || true)
              MSG="$MSG [Body: $BODY]"
           fi
           missing_services+=("$MSG")
         fi
      else
        # The pre-health port probe is a required observation: when the
        # Functions listener is unavailable here, its health check has not
        # positively succeeded, so readiness must stay unsatisfied until a
        # later evaluation observes a completed healthy response
        # (issue #5487, REQ-005). Without this branch the evaluation could
        # return success without any positive Functions health response.
        all_ready=false
        _record_owner_missing "emu" "Firebase Function Health (Functions port ${FIREBASE_FUNCTIONS_PORT} unavailable)"
        missing_services+=("Firebase Function Health (Functions port ${FIREBASE_FUNCTIONS_PORT} unavailable)")
      fi
    else
      all_ready=false
      missing_services+=("Readiness deadline exceeded before Functions health check")
    fi

    # Check Yjs WebSocket (if port is open)
    if [ "$deadline" -le 0 ] || ! _deadline_expired "$deadline"; then
      if port_is_open "${TEST_YJS_PORT}" "$deadline"; then
         local _yjs_probe
         _yjs_probe=$(_probe_timeout "$deadline")
         if ! _run_bounded "$_yjs_probe" curl -s --connect-timeout 2 --max-time "$_yjs_probe" "http://127.0.0.1:${TEST_YJS_PORT}/" >/dev/null 2>&1; then
            # The nc fallback must not start past the deadline: the curl
            # probe above may have consumed the rest of the budget
            # (issue #5487, REQ-005).
            local _yjs_nc_ok=false
            if [ "$deadline" -le 0 ] || ! _deadline_expired "$deadline"; then
              if _run_bounded "$(_probe_timeout "$deadline")" nc -w 2 -z 127.0.0.1 "${TEST_YJS_PORT}" >/dev/null 2>&1; then
                _yjs_nc_ok=true
              fi
            fi
            if [ "$_yjs_nc_ok" = false ]; then
              all_ready=false
              missing_services+=("Yjs WebSocket")
              _record_owner_missing "yjs" "Yjs WebSocket"
            fi
         fi
      fi
    else
      all_ready=false
      missing_services+=("Readiness deadline exceeded before Yjs check")
    fi

    # A timeout, probe failure, or otherwise unobservable service is never
    # ready: only positively observed checks satisfy the gate.
    if [ ${#missing_services[@]} -gt 0 ]; then
      LAST_READINESS_MISSING="${missing_services[*]}"
    else
      LAST_READINESS_MISSING=""
    fi

    if [ "$all_ready" = true ]; then
      return 0
    else
      if [ "$verbose" = "true" ] && [ ${#missing_services[@]} -gt 0 ]; then
        echo "Still waiting for: ${missing_services[*]}"
      fi
      return 1
    fi
  }

  # Fail the startup phase once the single wall-clock budget is exhausted.
  # Post-deadline subprocess diagnostics are skipped on purpose: they cannot
  # complete inside an already-exhausted budget, and running them would carry
  # the failure exit past the advertised deadline (issue #5486, REQ-001 and
  # REQ-005). The still-unsatisfied checks were recorded by the last
  # in-budget readiness evaluation (LAST_READINESS_MISSING); the Firebase
  # emulator startup log is a local file read that cannot block, so it is
  # still printed to preserve that diagnostic surface (REQ-004).
  _fail_deadline() {
    local _elapsed=$(( $(date +%s) - START_TIME ))
    echo "Timeout waiting for services after ${MAX_WAIT_SECONDS} seconds (deadline exceeded at ${_elapsed}s elapsed)."
    echo "Readiness checks still unsatisfied: ${LAST_READINESS_MISSING:-unknown (no readiness evaluation completed)}"
    # Name the owning service(s) behind the unsatisfied checks and the
    # automatic restarts already attempted, so a persistently broken
    # service is diagnosable without re-probing past the budget (REQ-005).
    local _affected=""
    [ -n "$OWNER_MISSING_YJS" ] && _affected="${_affected}${_affected:+ }yjs-server"
    [ -n "$OWNER_MISSING_LOG" ] && _affected="${_affected}${_affected:+ }log-service"
    [ -n "$OWNER_MISSING_VITE" ] && _affected="${_affected}${_affected:+ }vite-server"
    [ -n "$OWNER_MISSING_EMU" ] && _affected="${_affected}${_affected:+ }firebase-emulators"
    echo "Affected owning service(s): ${_affected:-unknown}"
    local _restarts=""
    [ "$RESTARTED_YJS" -eq 1 ] && _restarts="${_restarts}${_restarts:+ }yjs-server"
    [ "$RESTARTED_LOG" -eq 1 ] && _restarts="${_restarts}${_restarts:+ }log-service"
    [ "$RESTARTED_VITE" -eq 1 ] && _restarts="${_restarts}${_restarts:+ }vite-server"
    [ "$RESTARTED_EMU" -eq 1 ] && _restarts="${_restarts}${_restarts:+ }firebase-emulators"
    echo "Automatic restarts attempted: ${_restarts:-none}"
    echo "Post-deadline process diagnostics skipped: the single ${MAX_WAIT_SECONDS}s wall-clock budget is already exhausted."
    # The tail above is usually drowned by Functions health checks; the
    # emulator startup section (versions, emulator list, bind errors) is
    # what diagnoses a missing emulator (issue #5453).
    if [ -f "${ROOT_DIR}/logs/firebase-emulators.log" ]; then
      echo "--- logs/firebase-emulators.log (head: emulator startup) ---"
      head -n 80 "${ROOT_DIR}/logs/firebase-emulators.log" || true
    fi
    exit 1
  }

  # Cap the poll pause so the sleep itself cannot carry the gate past the
  # deadline; the next iteration's deadline check then fails in budget.
  _capped_sleep() {
    local _sleep_for=2
    local _sleep_remaining
    _sleep_remaining=$(_readiness_remaining "$DEADLINE")
    if [ "$_sleep_remaining" -le 0 ]; then
      return 0
    fi
    if [ "$_sleep_remaining" -lt "$_sleep_for" ]; then
      _sleep_for="$_sleep_remaining"
    fi
    sleep "$_sleep_for"
  }

  while true; do
    local CURRENT_TIME ELAPSED REMAINING
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))
    REMAINING=$((DEADLINE - CURRENT_TIME))

    if [ "$REMAINING" -le 0 ]; then
      _fail_deadline
    fi

    # 1. PM2 process-state snapshot.
    local _pm2_rc=0
    _pm2_status_snapshot || _pm2_rc=$?
    if [ "$_pm2_rc" -eq 2 ]; then
      # Unobservable daemon: fail fast without recovery. Only positive
      # evidence names a service to restart (REQ-001), and unavailable
      # evidence must fail closed (issue #5486, REQ-003). A failed
      # observation at (or carried past) the deadline is a deadline
      # failure, not a crash report with fresh diagnostic budgets.
      if _deadline_expired "$DEADLINE"; then
        _fail_deadline
      fi
      echo "Detected crashed services via PM2. Exiting setup."
      # Diagnostics are capped at the remaining budget so they cannot carry
      # this failure exit past DEADLINE; local log tails cannot block.
      _run_bounded "$(_probe_timeout "$DEADLINE")" pm2 logs --lines 50 --nostream || true
      # Force log dumping specifically for server applications
      echo "[TAILING] Tailing last 50 lines for [all] processes (change the value with --lines option)"
      if [ -f "${ROOT_DIR}/server/logs/yjs-server.log" ]; then
         echo "/__w/outliner/outliner/logs/yjs-server.log last 50 lines:"
         tail -n 50 "${ROOT_DIR}/server/logs/yjs-server.log" || true
      fi
      if [ -f "${ROOT_DIR}/server/logs/log-service.log" ]; then
         echo "/__w/outliner/outliner/logs/log-service.log last 50 lines:"
         tail -n 50 "${ROOT_DIR}/server/logs/log-service.log" || true
      fi
      exit 1
    elif [ "$_pm2_rc" -eq 1 ]; then
      # Positively observed terminal/non-starting services (REQ-001):
      # restart each affected owning service once and keep evaluating
      # within the same deadline. A service that is bad again after its
      # one restart ends the attempt here with diagnostics instead of
      # looping (REQ-004, REQ-005).
      if _deadline_expired "$DEADLINE"; then
        _fail_deadline
      fi
      local _restarted_any=false
      local _repeat_offender=""
      local _bad_line _bad_name _bad_state _bad_owner
      while IFS= read -r _bad_line; do
        [ -z "$_bad_line" ] && continue
        _bad_name=${_bad_line%%:*}
        _bad_state=${_bad_line#*:}
        _bad_owner=$(_pm2_owner_key "$_bad_name")
        [ -z "$_bad_owner" ] && continue
        if _owner_restarted "$_bad_owner"; then
          _repeat_offender="${_repeat_offender}${_repeat_offender:+ }${_bad_name}(${_bad_state})"
        else
          _restart_owner_service "$_bad_owner" "PM2 service ${_bad_name} is in state '${_bad_state}' before readiness."
          _restarted_any=true
        fi
      done <<< "$PM2_BAD_SERVICES"
      if [ "$_restarted_any" = false ]; then
        echo "PM2 service(s) still in a terminal/non-starting state after automatic restart: ${_repeat_offender}. No further restarts; failing within the startup deadline."
        echo "Readiness checks still unsatisfied: ${LAST_READINESS_MISSING:-unknown (no readiness evaluation completed)}"
        echo "Affected owning service(s): ${_repeat_offender}"
        _run_bounded "$(_probe_timeout "$DEADLINE")" pm2 logs --lines 50 --nostream || true
        exit 1
      fi
      # Recovery consumed part of the budget; re-check before re-polling
      # so the restart cannot spend an expired budget.
      if _deadline_expired "$DEADLINE"; then
        _fail_deadline
      fi
      _capped_sleep
      continue
    fi

    # 2. Check if services are ready
    # Check with verbose logging every 10 seconds
    local log_status=false
    if [ $((ELAPSED % 10)) -eq 0 ]; then
       echo "Waiting for services... (${ELAPSED}s / ${MAX_WAIT_SECONDS}s)"
       log_status=true
    fi

    if _is_service_ready "$log_status" "$DEADLINE"; then
      # A readiness evaluation that only completes after the deadline is a
      # deadline failure, never a success (issue #5486, REQ-001/REQ-005).
      if _deadline_expired "$DEADLINE"; then
        _fail_deadline
      fi
      if [ "$RECOVERY_FAILED" = true ]; then
        echo "Startup failed: an automatic PM2 restart failed; readiness cannot override recovery failure."
        exit 1
      fi
      echo "=== All test services are ready! ==="
      break
    fi

    # The evaluation above may have consumed the rest of the budget (a probe
    # started just before expiry). Recovery and re-polling must not run past
    # the deadline, so re-check before touching the process manager again.
    if _deadline_expired "$DEADLINE"; then
      _fail_deadline
    fi

    # Generic stall recovery (issue #5487, REQ-002/REQ-007): restart only
    # the owning service(s) whose checks have been continuously unsatisfied
    # for STALL_THRESHOLD seconds. This generalizes the legacy
    # Hosting-only retry (issue #5453) — the firebase-emulators stall it
    # covered is now one case of the same policy, so a single recovery
    # episode performs exactly one restart (REQ-006). Restarting before any
    # test runs is safe: the auth emulator holds no test state yet
    # (TestHelpers.getTestAuthToken self-provisions the test user on demand
    # and init-firebase-emulator.js runs after this gate), and unrelated
    # services are untouched by another owner's restart.
    _evaluate_owner_stalls "$(($(date +%s) - START_TIME))"

    # The evaluation and any recovery above may have consumed the rest of
    # the budget; re-check before sleeping so recovery cannot spend an
    # expired budget.
    if _deadline_expired "$DEADLINE"; then
      _fail_deadline
    fi

    _capped_sleep
  done

  # Initialize Firebase emulator (creates test users, etc.)
  echo "Initializing Firebase emulator..."
  export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:${FIREBASE_AUTH_PORT}"
  export AUTH_EMULATOR_HOST="127.0.0.1:${FIREBASE_AUTH_PORT}"
  export FIRESTORE_EMULATOR_HOST="127.0.0.1:${FIREBASE_FIRESTORE_PORT}"
  export FIREBASE_EMULATOR_HOST="127.0.0.1:${FIREBASE_FUNCTIONS_PORT}"
  cd "${ROOT_DIR}/server/scripts"
  node init-firebase-emulator.js || echo "Warning: Firebase emulator initialization had issues"
  cd "${ROOT_DIR}"
}

# Kill any process bound to REQUIRED_PORTS and wait for them to be free.
# Shared by scripts/setup.sh and scripts/ci-e2e-start.sh.
cleanup_ports() {
  echo "Cleaning up ports: ${REQUIRED_PORTS[*]}"
  for port in "${REQUIRED_PORTS[@]}"; do
    if [ -n "$port" ]; then
      # Find processes using the port, transform newlines to spaces for `kill`
      local pids
      pids=$(lsof -t -i :"$port" 2>/dev/null | tr '\n' ' ' | sed 's/ $//' || true)

      if [ -n "$pids" ]; then
        echo "Killing processes on port $port: $pids"
        # Try SIGTERM first
        kill $pids 2>/dev/null || true
        sleep 1

        # Check if still running and force kill
        pids=$(lsof -t -i :"$port" 2>/dev/null | tr '\n' ' ' | sed 's/ $//' || true)
        if [ -n "$pids" ]; then
             echo "Force killing processes on port $port: $pids"
             kill -9 $pids 2>/dev/null || true
        fi
      fi
    fi
  done

  # Wait for ports to be free
  for port in "${REQUIRED_PORTS[@]}"; do
    if [ -n "$port" ]; then
        local wait_count=0
        while lsof -t -i :"$port" >/dev/null 2>&1; do
            echo "Waiting for port $port to be free... (attempt $wait_count)"
            sleep 1
            wait_count=$((wait_count + 1))
            if [ "$wait_count" -gt 30 ]; then
                echo "Warning: Port $port is still in use after 30 seconds."
                # Try force kill again just in case
                lsof -t -i :"$port" | xargs kill -9 2>/dev/null || true
                break
            fi
        done
    fi
  done
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
