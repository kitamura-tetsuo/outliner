FROM ubuntu:26.04
# Provision only the independent harness prerequisites. Required application
# libraries are acquired by the real setup implementation in each fresh run.
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates nodejs npm openjdk-21-jre-headless sudo python3 curl \
    && rm -rf /var/lib/apt/lists/*
COPY client/package-lock.json /fixture/client/package-lock.json
RUN version=$(node -p "require('/fixture/client/package-lock.json').packages['node_modules/@playwright/test'].version") \
    && npm install --prefix /runtime --no-save "@playwright/test@$version" \
    && ln -s /runtime/node_modules /fixture/client/node_modules
