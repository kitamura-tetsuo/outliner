# Outliner Project Guidelines

This document consolidates the key development policies for this repository. Follow these rules whenever you work on the project.

## 1. Documentation

- **Feature files**: Write end-user features in `docs/client-features/<slug>-<title>-<uuid>.yaml`. `<slug>` is a three-letter code from the feature ID. Each file must include `title` (English) and `title-ja` (Japanese).
- **Dev features**: Store ENV-* features in `docs/dev-features/<slug>-<title>-<uuid>.yaml`.
- **Feature IDs**: Use an 8-character hexadecimal UUID (e.g. `FTR-1a2b3c4d`) rather than sequential numbers.
- `docs/client-features.yaml` and `docs/dev-features.yaml` are generated automatically.
- Document intentionally omitted features in `docs/NON_GOALS.md`.
- `docs/feature-map.md` is auto-generated; never edit it manually.
- Regularly review and update documentation to avoid conflicts and keep best practices current.

## 2. Testing Policy

- Provide a test for every feature. Do not embed code that skips tests.
- Keep expected values strict even if tests take longer to run.
- Run tests in headless mode.
- Run `dprint fmt` before running tests.
- Before finishing your work, run the following TypeScript checks and fix any errors:
  ```
  cd client/e2e && npx tsc --noEmit --project tsconfig.json
  cd client && npx tsc --noEmit --project tsconfig.json
  ```
- Fix one test file at a time and run it immediately to confirm the fix.
- When code or tests change, run only the related test file. Use the following
  commands to run a specific test:
  - Unit: `cd client && npm run test:unit -- path/to/test.spec.ts`
  - Integration: `cd client && npm run test:integration -- path/to/test.spec.ts`
  - E2E: `cd client && npm run test:e2e -- path/to/test.spec.ts`
- CI keeps tests green on the `main` branch. If tests fail in your branch, the
  cause lies in changes made after you diverged from `main`. Investigate those
  modifications to identify the problem.
- Ensure test coverage for every implemented feature. Add detailed E2E scenarios whenever new behavior is introduced. Run Playwright tests one file at a time and document any timeouts; they will be rerun in another environment.
- Split any test file that grows beyond roughly 150 lines so that Playwright can run it reliably.
- Run environment maintenance tests (ENV-*) separately using `scripts/run-env-tests.sh`. These use Vitest. E2E tests use Playwright.
- Environment test spec files follow the same `<slug>-<title>-<uuid>.spec.ts` naming used in client E2E tests (e.g. `env-setup-script-starts-all-services-95e7c1a6.spec.ts`).
- Record test specs in `docs/client-features/<slug>-<title>-<uuid>.yaml` and match the file name pattern in the `client/e2e` directory.
- Retrieve SharedTree and cursor data with `treeValidation.ts` and `cursorValidation.ts` instead of mocks.

### Unit Test Mocking

Mocks are generally forbidden. Limited exceptions:

1. **Svelte stores** – use `vi.mock` to control store behavior.
2. **Fluid `Item` objects** – provide minimal stubs with required properties like `id` and `text`.
   Add comments explaining the purpose and scope of any mock.

- **No mocking logic in production code**. If unit tests require mocks, place all
  mock-related code inside the test files and keep it out of the application
  code.
- **No test data creation routines in production code**. Test data initialization,
  debug buttons, and test-specific functionality must be isolated to test
  environments only. Production code should not contain any test-related logic.

### Test Implementation Guidelines

- **Manual workarounds in tests are not acceptable**. If a test requires manual positioning of textarea elements or other DOM manipulation to pass, the underlying implementation must be fixed instead.
- **Tests should verify actual behavior**. Avoid bypassing implementation issues with test-specific workarounds that mask real problems.

### Running E2E Tests

- Always run `scripts/codex-setup.sh` before tests to start emulators.
- Execute E2E tests one file at a time with `scripts/run-e2e-progress-for-codex.sh 1`.
- The Codex environment is prone to timeouts. Keep each Playwright spec short and split larger flows across multiple files. Document any timeouts; tests will be rerun elsewhere.
- Use `TestHelpers.prepareTestEnvironment(page)` in `test.beforeEach` and Playwright's `expect(locator).toBeVisible()` assertions.
- Create projects and pages programmatically via `fluidClient` rather than via the UI.
- Simulate user input with `page.keyboard.type()` and manage cursors with `editorStore.setCursor()` and `cursor.insertText()` followed by a 500 ms wait and `waitForCursorVisible()`.
- Use `data-item-id` selectors instead of `nth()`.
- Clipboard tests must use the real clipboard API (works only in HTTPS or localhost).
- Do not call `await import` inside `page.evaluate()` to avoid creating multiple browser instances.
- If tests time out, document the attempt; the CI environment will run them again.
- **Navigation Requirements**: Use only Svelte-managed page navigation. Do not use alternative navigation methods that bypass SvelteKit's routing system.

### Troubleshooting

- **Always check error logs first**: When encountering errors, immediately examine `server/logs/test-svelte-kit.log` for detailed error information before attempting fixes.
- If a specific test fails to start or stalls, inspect `server/logs/test-svelte-kit.log` for details.
- Before assuming the test server is down, verify it with `curl -s http://localhost:7090/ | head -c 100`.
- If the cause of an E2E test failure is unclear, investigate using Playwright MCP.
- Duplicate Firebase initialization often causes 30 s timeouts—ensure `UserManager.initializeFirebaseApp()` checks `getApps()` before calling `initializeApp()`.
- **Tinylicious Container Restoration Issue**: The error "default dataStore [rootDOId] must exist" occurs when trying to reload saved Fluid containers in Tinylicious (test environment). This is a known Tinylicious bug that doesn't occur in production. In test environments, avoid reloading saved containers and use alternative testing approaches instead.
- **Test Isolation and Regression Prevention**: When troubleshooting failing tests, destructive changes to shared code may occur. If you modify common code outside the specific test target, run the basic E2E tests to verify no breaking changes have been introduced. If breaking changes are detected, revert the modifications to maintain test stability.
- TypeScript macro shims: If `npx tsc --noEmit --project client/e2e/tsconfig.json` fails on `$state/$derived/$effect` in `.svelte.ts` files, add a `client/src/types/svelte5-shim.d.ts` declaring these macros for type checking only.
- Use playwrite mcp to debug component issues.

### Firebase Functions Emulator

**CRITICAL**: Always use Firebase Functions Emulator for testing, never mock Firebase Functions. The emulator provides the actual Firebase Functions environment and is essential for proper testing.

**IMPORTANT**: Firebase Functions emulator DOES apply Firebase Hosting rewrite rules from firebase.json. Tests should use `/api/` endpoints (e.g., `/api/fluid-token`), not direct function URLs like `/outliner-d57b0/us-central1/functionName`. The emulator respects the hosting configuration and rewrites `/api/function-name` to the appropriate function.

- Firebase Functions Emulator runs on port 57070 (configured in firebase.json)
- Firebase Storage Emulator runs on port 59200 (configured in firebase.json)
- Firebase Auth Emulator runs on port 59099 (configured in firebase.json)
- Firebase Firestore Emulator runs on port 58080 (configured in firebase.json)
- Use `scripts/codex-setup.sh` to start all Firebase emulators
- All attachment upload/download functionality requires Firebase Functions Emulator to be running
- Tests will fail with "API error 404" if Firebase Functions Emulator is not running

### Production Environment Testing

**Production Cloud Backend Testing**: For testing Firebase Auth token validation with production Firebase Auth services:

1. **Start Production Cloud Backend Servers**:
   ```bash
   firebase emulators:start --only hosting,functions --project outliner-d57b0
   ```
   - Firebase Functions with Hosting emulator on port 57070
   - Uses production Firebase Auth and Firestore services
   - Azure Fluid Relay configuration loaded from environment variables

2. **Start Production SvelteKit Server** (for API proxy testing):
   ```bash
   NODE_ENV=production npx dotenvx run --env-file=.env.production -- npm run dev -- --host 0.0.0.0 --port 7073 --mode production
   ```

3. **Run Production Tests**:
   ```bash
   cd client && npm run test:production
   ```

4. **Test Coverage**: Production tests validate:
   - Firebase ID token validation against production Firebase Auth
   - Azure Fluid Relay token generation
   - Container-specific token requests
   - SvelteKit API proxy functionality
   - Error handling for invalid tokens

**Important**: Production tests use real Firebase Auth services and require proper environment configuration. Test users are automatically created and deleted during test execution.

- When addressing production environment errors, wait at least 30 minutes after a GitHub Actions deployment completes and confirm in production that the issue is resolved.

## 3. Code Style

- Prefer `undefined` over `null`.
- Avoid duplicate functions and do not use `page.waitForLoadState('networkidle')`.
- Process synchronously when possible.
- Write all branch names and commit messages in English.

## 4. Development Workflow

- At the end of each session, create a prompt for the next session describing remaining tasks. Mention that tasks should proceed sequentially.
- Always track your working directory. Client code is in `client`, server code in `server`, and scripts in `scripts` (ENV-* tests are in `scripts/tests`). When using `launch-process`, set the `cwd` explicitly.
- Keep Svelte HTML elements reactive and prioritize performance. Prefer patterns where reactive variables are updated asynchronously, while overall processing remains synchronous when possible.
- After implementing changes, run `npm run build` in the `client` directory to confirm the code compiles correctly.

### Merge Workflow

- After merging branches, always run the following commands to ensure the merge was successful:
  1. `npm run build` in the `client` directory to verify compilation
  2. `npm test` in the `client` directory to run unit tests
- Fix any test failures before proceeding with further development
- Never skip tests or simplify them to avoid merge conflicts - always solve the actual problems

## 5. Cursor, Selection, and Item Handling

- Important files: `Cursor.ts`, `EditorOverlay.svelte`, `EditorOverlayStore.svelte.ts`, `OutlinerItem.svelte`.
- Maintain cursor X position when moving between items with arrow keys.
- Use the Range API to navigate visual lines. Items never contain newline characters.
- Selection range (SLR) logic is separate from cursor movement (CLM). Box selection is being implemented.
- Formatting uses Scrapbox syntax: **bold** `[[text]]`, _italic_ `[/text]`, strike-through `[-text]`, and code `text`.
- Active items show plain text with control characters visible. Internal links (`[page]` or `[/project/page]`) should navigate via SvelteKit routing and only create a new page in SharedTree once the user edits it.

## 6. Project & Firebase Configuration

- Projects use `title` (not `name`) and the project ID equals its Fluid container ID.
- **Firebase Functions Access**: Firebase Functions are accessed through Firebase Hosting at `http://localhost:57070/api` in development environments. This ensures proper routing and CORS handling.
- **Production Cloud Backend**: For Production Cloud Backend configuration, Firebase Functions must be accessed through Firebase Hosting emulator (port 57070) rather than direct Functions emulator access.
- In both deployed and test environments, call Firebase Functions through the host's `/api/` route.
- Use `.env` files for Functions v2 environment variables and never hardcode credentials.
- Do not bypass authentication; tests should authenticate against the Firebase Auth emulator.
- **Firebase Emulator Setup**: Always start Firebase Functions with Hosting emulator using `firebase emulators:start --only hosting,functions --project outliner-d57b0` to ensure proper API routing. The hosting emulator applies rewrite rules from firebase.json, allowing `/api/` endpoints to work correctly.

## 7. GitHub Actions & Claude Code Integration

- **Issue Analysis**: The `.github/workflows/issue-claude-action.yml` workflow automatically analyzes new issues and issue comments containing `@claude` using Claude Code Action with self-hosted runners.
- **PR Auto-Fix**: The `.github/workflows/pr-test-fix.yml` workflow automatically fixes failing tests in PRs using Claude Code Action, repeating until tests pass or maximum attempts are reached.
- **Claude Code Router**: Uses `@musistudio/claude-code-router` to route requests to Gemini CLI, enabling cost-effective AI analysis on self-hosted infrastructure.
- **Self-Hosted Runner Requirements**:
  - Gemini CLI must be authenticated via `gemini auth login` or `GEMINI_API_KEY` secret
  - Node.js 22+ and npm must be available
  - Network access to Google APIs required
- **Authentication Setup**:
  - Preferred: Run `gemini auth login` on the runner machine for persistent OAuth credentials
  - Alternative: Set `GEMINI_API_KEY` repository secret with a valid API key
- **Router Configuration**: Uses a custom Gemini CLI transformer that executes actual `gemini` CLI commands, routing all requests to `gemini-2.5-pro` for high-quality analysis and responses. Uses `--force-model` option to ensure the specified model is used and supports MCP and other advanced features.
- **Auto-Fix Process**: When PR tests fail, Claude analyzes the failures, implements fixes, runs tests again, and commits/pushes changes if tests pass. Maximum 5 attempts per failure.

## 8. Preferred Code Patterns

- Use Svelte 5 `$derived` for derived state and `$state` in stores. `$state` is only valid in `.svelte` or `.svelte.ts` files.
- Avoid `svelte/store`; rely on Svelte 5 `$state` for all store functionality.
- Keep existing `$effect` blocks short (under 10 lines) and prefer `onMount` for initialization.
- Do not add new code that uses Svelte 5 `$effect`.
- Svelte 5 `$effect` is only allowed when there is no other way to achieve the desired behavior.
- Implement API calls in `fluidService` and call them from components. Provide a `getFluidClientByProjectTitle` function that searches `clientRegistry` by `Project.title`.
- Export manager instances directly (`export const userManager = new UserManager()`) rather than via `getInstance()`.
- Rename `firestoreStore.ts` to `firestoreStore.svelte.ts` to enable `$state` usage.
- When testing links and cursor behavior, apply the patterns proven in LNK-0003: programmatic cursor creation, text insertion, waits, and visibility checks.

## 9. Node.js Package Management and NPM Operations Policy

- Consent: The project owner has authorized the agent to run npm operations without prior confirmation for routine maintenance tasks within this repository.
- Allowed without prior confirmation (repository scope only, default cwd: `client`):
  - `npm ci`
  - `npm install` / `npm uninstall` / `npm update` (use npm CLI only; never edit package files manually)
  - `npm run build`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e` (headless)
- Safety rules:
  - Use npm commands only inside this repo (primarily `client/`).
  - Do not use `--force` or `--legacy-peer-deps` unless explicitly requested.
  - Prefer minimal, compatible upgrades that satisfy peerDependencies; avoid broad or unnecessary upgrades.
  - After dependency changes, always run build and unit tests. For broader updates, run integration/E2E tests selectively as appropriate.
  - Never deploy, modify production data, or run resource-intensive tasks without explicit instruction.
  - Do not manually edit `package.json`, lock files, or config to change versions; always use the package manager.
  - When a change needs to be tracked, commit via the normal Git workflow (branch, commit, PR) as required by the task.
- Troubleshooting guidance:
  - For peer conflicts, prefer upgrading the relevant peer plugins (e.g., `@sveltejs/vite-plugin-svelte`) to match the current Vite/SvelteKit rather than downgrading Vite.
  - Avoid workaround flags (`--force`, `--legacy-peer-deps`) in favor of a correct dependency graph.

---

Follow these guidelines to keep documentation, code, and tests consistent across the project.
