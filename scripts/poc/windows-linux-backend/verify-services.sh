#!/usr/bin/env bash
set -euo pipefail
mkdir -p /opt/outliner-evidence
urls=(http://127.0.0.1:7090/ http://127.0.0.1:7093/health http://127.0.0.1:57070/api/health http://127.0.0.1:59099/ http://127.0.0.1:58080/)
deadline=$((SECONDS + 300))
while (( SECONDS < deadline )); do
  ready=true
  for url in "${urls[@]}"; do
    status=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 3 "$url" || true)
    printf '%s %s
' "$url" "$status"
    if [ "$status" != 200 ]; then ready=false; fi
  done
  if [ "$ready" = true ]; then exit 0; fi
  sleep 2
done
ss -lntp
exit 1
