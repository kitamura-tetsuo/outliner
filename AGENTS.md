# Outliner Project Guidelines

This document consolidates the key development policies for this repository. Follow these rules whenever you work on the project.

## 1. Documentation

- **Feature files**: Write end-user features in `docs/client-features/<slug>-<title>-<uuid>.yaml`. `<slug>` is a three-letter code from the feature ID. Each file must include `title` (English) and `title-ja` (Japanese).
- **Dev features**: Store ENV-* features in `docs/dev-features/<slug>-<title>-<uuid>.yaml`.
- `docs/client-features.yaml` and `docs/dev-features.yaml` are generated automatically.
- Document intentionally omitted features in `docs/NON_GOALS.md`.
- `docs/feature-map.md` is auto-generated; never edit it manually.
- Regularly review and update documentation to avoid conflicts and keep best practices current.

## 2. Testing Policy

- Provide a test for every feature. Do not embed code that skips tests.
- Keep expected values strict even if tests take longer to run.
- Run tests in headless mode.
- Run `dprint fmt` before running tests.
- Fix one test file at a time and run it immediately to confirm the fix.
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

### Test Implementation Guidelines

- **Manual workarounds in tests are not acceptable**. If a test requires manual positioning of textarea elements or other DOM manipulation to pass, the underlying implementation must be fixed instead.
- **Tests should verify actual behavior**. Avoid bypassing implementation issues with test-specific workarounds that mask real problems.

### Running E2E Tests

- Always run `scripts/codex-setup.sh` before tests to start emulators.
- Execute E2E tests one file at a time with `scripts/run-e2e-progress-for-codex.sh 1`.
- The `run-e2e-progress-for-codex.sh` script is for the Codex environment only. Do not include it in workflows or scripts intended for other environments.
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
- Check `server/logs/test-svelte-kit.log` when a test stalls.
- Verify the server with `curl -s http://localhost:7090/ | head -c 100`.
- Duplicate Firebase initialization often causes 30 s timeouts—ensure `UserManager.initializeFirebaseApp()` checks `getApps()` before calling `initializeApp()`.
- **Tinylicious Container Restoration Issue**: The error "default dataStore [rootDOId] must exist" occurs when trying to reload saved Fluid containers in Tinylicious (test environment). This is a known Tinylicious bug that doesn't occur in production. In test environments, avoid reloading saved containers and use alternative testing approaches instead.
- **Test Isolation and Regression Prevention**: When troubleshooting failing tests, destructive changes to shared code may occur. If you modify common code outside the specific test target, run the basic E2E tests to verify no breaking changes have been introduced. If breaking changes are detected, revert the modifications to maintain test stability.

### Firebase Functions Emulator

**CRITICAL**: Always use Firebase Functions Emulator for testing, never mock Firebase Functions. The emulator provides the actual Firebase Functions environment and is essential for proper testing.

- Firebase Functions Emulator runs on port 57000 (configured in firebase.json)
- Firebase Storage Emulator runs on port 59200 (configured in firebase.json)
- Firebase Auth Emulator runs on port 59099 (configured in firebase.json)
- Firebase Firestore Emulator runs on port 58080 (configured in firebase.json)
- Use `scripts/codex-setup.sh` to start all Firebase emulators
- All attachment upload/download functionality requires Firebase Functions Emulator to be running
- Tests will fail with "API error 404" if Firebase Functions Emulator is not running

## 3. Code Style

- Prefer `undefined` over `null`.
- Avoid duplicate functions and do not use `page.waitForLoadState('networkidle')`.
- Process synchronously when possible.
- Write all branch names and commit messages in English.

## 4. Development Workflow

- At the end of each session, create a prompt for the next session describing remaining tasks. Mention that tasks should proceed sequentially.
- Always track your working directory. Client code is in `client`, server code in `server`, and scripts in `scripts` (ENV-* tests are in `scripts/tests`). When using `launch-process`, set the `cwd` explicitly.
- Keep Svelte HTML elements reactive and prioritize performance. Use asynchronous updates where appropriate.
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
- Firebase Functions are accessed through Hosting at `http://localhost:57000/api`.
- In both deployed and test environments, call Firebase Functions through the host's `/api/` route.
- Use `.env` files for Functions v2 environment variables and never hardcode credentials.
- Do not bypass authentication; tests should authenticate against the Firebase Auth emulator.

## 7. Preferred Code Patterns

- Use Svelte 5 `$derived` for derived state and `$state` in stores. `$state` is only valid in `.svelte` or `.svelte.ts` files.
- Avoid `svelte/store`; rely on Svelte 5 `$state` for all store functionality.
- Keep existing `$effect` blocks short (under 10 lines) and prefer `onMount` for initialization.
- Do not add new code that uses Svelte 5 `$effect`.
- Implement API calls in `fluidService` and call them from components. Provide a `getFluidClientByProjectTitle` function that searches `clientRegistry` by `Project.title`.
- Export manager instances directly (`export const userManager = new UserManager()`) rather than via `getInstance()`.
- Rename `firestoreStore.ts` to `firestoreStore.svelte.ts` to enable `$state` usage.
- When testing links and cursor behavior, apply the patterns proven in LNK-0003: programmatic cursor creation, text insertion, waits, and visibility checks.

---

Follow these guidelines to keep documentation, code, and tests consistent across the project.
