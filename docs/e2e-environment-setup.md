# Reproducible E2E Environment Setup

`scripts/bootstrap-e2e.sh` takes a fresh clone (or a fresh cloud container) to a
state where Playwright E2E tests pass, and then proves it by running a spec.

```bash
# Prepare everything and run the smoke spec (client/e2e/basic/basic.spec.ts)
scripts/bootstrap-e2e.sh

# Prepare everything and run specific specs
scripts/bootstrap-e2e.sh client/e2e/core/clm-cursor-blink-61a641e7.spec.ts

# Prepare only, no tests
scripts/bootstrap-e2e.sh --no-test
```

The script is idempotent: every run re-checks the prerequisites and restarts the
services, so it is safe to rerun after a container restart or a failed attempt.
Once it has succeeded, run further specs the usual way:

```bash
scripts/test.sh client/e2e/<path>.spec.ts
```

## What it does

1. **Prerequisites** – Node, npm, and a JRE 21+ for the Firebase emulators
   (installs a local JDK under `.jdk` when Java is missing).
2. **Dependencies** – `npm ci` for `server`, `functions`, `client`, and
   `scripts/tests`, links `shared/node_modules` to `client/node_modules`, and
   builds the server (`server/dist`).
3. **Browser** – `playwright install chromium`, with a fallback described below.
4. **Services** – delegates to `scripts/setup.sh`, which starts the PM2 apps
   `yjs-server` (7093), `log-service` (7091), `vite-server` (7090), and
   `firebase-emulators` (auth 59099, firestore 58080, functions 57070,
   hosting 57000, storage 59200), then waits for every port.
5. **Verification** – HTTP checks against SvelteKit, the Functions health
   endpoint, Auth, and Firestore, followed by the requested Playwright specs.

## Restricted networks (cloud sandboxes, proxied CI)

Some environments only allow the npm registry. The setup degrades instead of
failing:

| Blocked resource | Behavior |
| --- | --- |
| apt mirrors | `apt_is_available` probes once; OS package installation is skipped with a warning. Force it with `SKIP_APT_INSTALL=1`. |
| `cdn.playwright.dev` | `ensure_playwright_browsers` falls back to a Chromium already present in the image (`$PLAYWRIGHT_BROWSERS_PATH/chromium`, `/usr/bin/chromium`, …) and records the path in `.playwright-chromium-path`. `client/playwright.config.ts` reads that file and passes it as `launchOptions.executablePath`; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` overrides both. |
| `plugins.dprint.dev` | `scripts/test.sh` reports the formatting failure as a warning and continues. Use `SKIP_DPRINT=1` to skip the attempt. |

Nothing changes on a machine with unrestricted network access: the browser is
downloaded as before, `.playwright-chromium-path` is removed, and `dprint fmt`
still runs.

## Troubleshooting

- Service logs: `logs/`, `server/logs/`, and `pm2 logs --lines 50 --nostream`.
- Restart the stack: `pm2 delete all && scripts/setup.sh`.
- `scripts/setup.sh` skips its install steps once `.setup-installed` exists;
  delete that file to force a full reinstall.
- Playwright launched the wrong browser: delete `.playwright-chromium-path` and
  rerun `scripts/bootstrap-e2e.sh --no-test`.
