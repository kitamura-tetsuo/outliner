#!/usr/bin/env bash

set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
fixture=$(mktemp -d)
trap 'rm -rf "$fixture"' EXIT
cp "$repo_root/scripts/install-test-container-os-packages.sh" "$fixture/install.sh"

cat > "$fixture/Dockerfile" <<'EOF'
FROM mcr.microsoft.com/playwright:v1.64.1-jammy
COPY install.sh /usr/local/bin/install-test-container-os-packages
ARG CASE
RUN case "$CASE" in \
      success) /usr/local/bin/install-test-container-os-packages lsof ;; \
      unavailable) find /etc/apt -type f \( -name '*.list' -o -name '*.sources' \) \
          -exec sed -i 's/azure.archive.ubuntu.com/127.0.0.1/g' {} +; \
        APT_PRIMARY_HOST=127.0.0.1 APT_FALLBACK_HOST=127.0.0.2 \
          /usr/local/bin/install-test-container-os-packages lsof ;; \
      slow) python3 -c 'import socket,time; s=socket.socket(); s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1); s.bind(("127.0.0.1",18080)); s.listen(); c,_=s.accept(); time.sleep(300)' & \
        sleep 1; \
        find /etc/apt -type f \( -name '*.list' -o -name '*.sources' \) \
          -exec sed -i 's/azure.archive.ubuntu.com/127.0.0.1:18080/g' {} +; \
        APT_ACQUISITION_BUDGET_SECONDS=5 APT_PRIMARY_HOST=127.0.0.1:18080 \
          APT_FALLBACK_HOST=127.0.0.1:18081 \
          /usr/local/bin/install-test-container-os-packages lsof ;; \
      missing) /usr/local/bin/install-test-container-os-packages outliner-package-that-does-not-exist ;; \
      *) exit 64 ;; \
    esac
EOF

docker build --no-cache --build-arg CASE=success -t outliner-apt-regression:success "$fixture"
docker run --rm outliner-apt-regression:success dpkg-query -W -f='${db:Status-Status}\n' lsof | grep -qx installed

for negative_case in unavailable slow missing; do
    log="$fixture/${negative_case}.log"
    if timeout 180 docker build --no-cache --build-arg "CASE=${negative_case}" "$fixture" >"$log" 2>&1; then
        echo "Negative control unexpectedly built successfully: ${negative_case}" >&2
        exit 1
    fi
done

grep -q 'bounded primary and fallback attempts' "$fixture/unavailable.log"
grep -q 'exceeded its 5-second aggregate budget' "$fixture/slow.log"
grep -q 'Unable to locate package outliner-package-that-does-not-exist' "$fixture/missing.log"
