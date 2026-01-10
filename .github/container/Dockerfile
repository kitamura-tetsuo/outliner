FROM mcr.microsoft.com/playwright:v1.57.0-jammy

# Install Java and OS utilities
RUN apt-get update && \
    apt-get install -y openjdk-21-jre-headless xvfb lsof netcat-openbsd curl sudo python3-venv python3-pip && \
    rm -rf /var/lib/apt/lists/*

# Install global npm packages
RUN npm install -g firebase-tools tinylicious dotenv-cli cross-env @dotenvx/dotenvx dprint

# Set working directory
WORKDIR /github/workspace

# Copy scripts and package files
COPY scripts/ scripts/
COPY firebase.json .firebaserc ./
COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/
COPY client/src ./client/src
COPY server/package.json server/package-lock.json server/tsconfig.json ./server/
COPY server/src ./server/src
COPY functions/package.json functions/package-lock.json ./functions/

# Install dependencies via setup.sh
ENV SKIP_SERVER_START=1
ENV SKIP_PORT_WAIT=1
ENV SKIP_INSTALL=0
ENV IS_DOCKER_BUILD=true
RUN --mount=type=cache,target=/root/.npm bash scripts/setup.sh

# Build server
RUN cd server && npm run build

# Rebuild client dependencies that might need it (like esbuild)
RUN cd client && npm rebuild
