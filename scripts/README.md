# Test Environment Scripts

The local test server is started and prepared at once by `scripts/setup.sh`. Individual local startup scripts have been deprecated.

## Usage

1. Setup test environment and start server

```bash
scripts/setup.sh
```

- Firebase Emulators (Auth/Firestore/Functions/Hosting)
- Yjs WebSocket Server
- SvelteKit Server

Dependency installation and OS-dependent package installation are performed only on the first run. Subsequent runs will complete quickly.

2. Sequential execution of Playwright (for cloud environments)

```bash
scripts/run-e2e-progress.sh 1
```

In cloud environments, run E2E files one by one to avoid timeouts.

3. Environment maintenance tests (ENV-*)

```bash
scripts/run-env-tests.sh
```

## Log Files

- Logs for each service are output under `server/logs/`.
