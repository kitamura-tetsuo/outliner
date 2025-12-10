FROM mcr.microsoft.com/playwright:v1.56.1-jammy

# Install Java and OS utilities
RUN apt-get update && \
    apt-get install -y openjdk-17-jre-headless xvfb lsof netcat-openbsd curl sudo python3-venv python3-pip && \
    rm -rf /var/lib/apt/lists/*

# Install global npm packages
RUN npm install -g firebase-tools tinylicious dotenv-cli cross-env @dotenvx/dotenvx dprint

# Create cache directories
WORKDIR /cache

# Copy package files
# We use a pattern to avoid errors if directories don't exist, though we know they do.
# But COPY requires explicit paths.
COPY client/package.json client/package-lock.json ./client/
COPY server/package.json server/package-lock.json ./server/
COPY functions/package.json functions/package-lock.json ./functions/

# Install dependencies
# We ignore scripts to speed up install and avoid issues with missing tools in the minimal build env
RUN cd client && npm ci --ignore-scripts
RUN cd server && npm ci --ignore-scripts
RUN cd functions && npm ci --ignore-scripts

# Rebuild client dependencies that might need it (like esbuild)
RUN cd client && npm rebuild

# Set working directory back to default
WORKDIR /github/workspace
