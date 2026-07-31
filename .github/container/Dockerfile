# Must match the Playwright version resolved in client/package-lock.json: the
# image ships the browser bundle for exactly this release, and a mismatch makes
# every E2E test fail at browserType.launch with "Executable doesn't exist".
FROM mcr.microsoft.com/playwright:v1.62.0-jammy

# Install Java and OS utilities
RUN apt-get update -o Acquire::Retries=3 -o Acquire::http::Timeout=20 -o Acquire::ForceIPv4=true && \
    apt-get install -y -o Acquire::Retries=3 -o Acquire::http::Timeout=20 -o Acquire::ForceIPv4=true openjdk-21-jre-headless xvfb lsof netcat-openbsd curl sudo python3-venv python3-pip && \
    rm -rf /var/lib/apt/lists/*

# Install global npm packages
RUN npm install -g firebase-tools tinylicious dotenv-cli cross-env @dotenvx/dotenvx dprint pm2

# Create cache directories
WORKDIR /cache

# Copy package files
# We use a pattern to avoid errors if directories don't exist, though we know they do.
# But COPY requires explicit paths.
# Copy scripts and package files
COPY package.json package-lock.json ./
RUN npm ci
COPY scripts/ scripts/
COPY firebase.json firebase.emulator.json .firebaserc ecosystem.config.cjs ./
COPY client/package.json client/package-lock.json ./client/
COPY server/package.json server/package-lock.json ./server/
COPY functions/package.json functions/package-lock.json ./functions/
# Shared schema package manifest: the client postinstall installs ../shared so
# the framework-neutral schema resolves its Yjs copy during type-checking.
COPY shared/package.json ./shared/

# Install dependencies via setup.sh
ENV SKIP_INSTALL=0
ENV CI=true
ENV SKIP_BUILD=1
RUN SKIP_SERVER_START=1 SKIP_PORT_WAIT=1 bash scripts/setup.sh

# Rebuild client dependencies that might need it (like esbuild)
RUN cd client && npm rebuild

# Set working directory back to default
WORKDIR /github/workspace
