FROM eclipse-temurin:21-jre-noble AS java-runtime

FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm

# Firebase CLI requires Java 21+. Copy the maintained, multi-architecture
# Temurin runtime from its official image instead of relying on Bookworm's
# older default-jre package.
COPY --from=java-runtime /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="${JAVA_HOME}/bin:${PATH}"
RUN java -version && test "$(java -XshowSettings:properties -version 2>&1 | sed -n 's/^ *java.specification.version = //p')" -ge 21

# Install system dependencies if needed
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get -y install --no-install-recommends \
    # Add any extra dependencies you might need here
    curl \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    xauth \
    python3.11-venv \
    python3-pip \
    pre-commit \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    fluxbox \
    dbus-x11 \
    gnome-keyring \
    seahorse \
    libsecret-1-0 \
    x11-utils \
    x11-apps \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Install Docker CLI
RUN curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends docker-ce-cli \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Switch to non-root user
USER node

# Install Playwright
RUN npx playwright install --with-deps
RUN npm install -g dotenv-cli
RUN curl -fsSL https://dprint.dev/install.sh | sh

# Any additional customizations can go here

# Switch back to root for permissions compatibility with VSCode
USER root
