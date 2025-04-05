FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm

# Install system dependencies if needed
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    # Add any extra dependencies you might need here
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Switch to non-root user
USER node

# Install Playwright
RUN npx playwright install --with-deps

# Any additional customizations can go here

# Switch back to root for permissions compatibility with VSCode
USER root