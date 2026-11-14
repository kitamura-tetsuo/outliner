#!/usr/bin/env bash
set -euo pipefail
cp -r /source/scripts /fixture/scripts
export ROOT_DIR=/fixture
case "$1" in
  success)
    bash /fixture/scripts/setup-direct-runner-os.sh
    # Independent producer/consumer evidence: dpkg state plus a real browser.
    for package in lsof libcairo2-dev; do
      test "$(dpkg-query -W -f='${Status}' "$package")" = 'install ok installed'
    done
    cd /fixture/client
    node - <<'NODE'
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({headless: true});
  const page = await browser.newPage();
  await page.setContent('<title>direct-runner regression</title>');
  if (await page.title() !== 'direct-runner regression') throw new Error('browser assertion failed');
  await browser.close();
  console.log('INDEPENDENT_BROWSER_EXECUTED');
})().catch(error => { console.error(error); process.exitCode = 1; });
NODE
    ;;
  unavailable|slow)
    # Only the disposable container's source configuration changes. No host DNS,
    # network rules, security policy or package database is touched.
    rm -f /etc/apt/sources.list /etc/apt/sources.list.d/*
    if [ "$1" = slow ]; then
      python3 -u - <<'PY' &
import socket, threading, time
server = socket.socket()
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(('127.0.0.1', 18080))
server.listen()
print('SLOW_SOURCE_LISTENING', flush=True)
while True:
    connection, _ = server.accept()
    def hang(c):
        if c.recv(1):
            print('SLOW_SOURCE_REQUEST', flush=True)
            time.sleep(300)
        c.close()
    threading.Thread(target=hang, args=(connection,), daemon=True).start()
PY
      # Wait for real socket availability, not a fixed scheduling assumption.
      python3 - <<'PY'
import socket, time
for _ in range(100):
    try:
        socket.create_connection(('127.0.0.1', 18080), timeout=.1).close()
        break
    except OSError:
        time.sleep(.05)
else:
    raise RuntimeError('slow source did not start')
PY
      source_url=http://127.0.0.1:18080
    else
      source_url=http://127.0.0.1:18081
    fi
    echo "Isolated package source=$source_url"
    echo "deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] $source_url resolute main" > /etc/apt/sources.list
    E2E_OS_BUDGET_SECONDS=15 bash /fixture/scripts/setup-direct-runner-os.sh
    ;;
  missing)
    # A real warm browser cache cannot make an absent package pass verification.
    bash /fixture/scripts/setup-direct-runner-os.sh
    dpkg --remove --force-depends lsof
    test -d /root/.cache/ms-playwright
    echo MISSING_DEPENDENCY_CONTROL
    # This genuine APT success only downloads; it cannot prove installation.
    apt-get -y --download-only install lsof
    echo REAL_DOWNLOAD_ONLY_COMPLETED
    source /fixture/scripts/common-functions.sh
    verify_required_os_packages lsof
    ;;
  *) exit 64 ;;
esac
