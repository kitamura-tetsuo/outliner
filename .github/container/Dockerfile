FROM mcr.microsoft.com/playwright:v1.57.0-jammy

# Install Java and OS utilities
RUN apt-get update && \
    apt-get install -y openjdk-21-jre-headless xvfb lsof netcat-openbsd curl sudo python3-venv python3-pip && \
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

# Install dependencies via setup.sh
ENV SKIP_INSTALL=0
ENV CI=true
ENV SKIP_BUILD=1
RUN SKIP_SERVER_START=1 SKIP_PORT_WAIT=1 bash scripts/setup.sh

# Rebuild client dependencies that might need it (like esbuild)
RUN cd client && npm rebuild

# Set working directory back to default
WORKDIR /github/workspace
