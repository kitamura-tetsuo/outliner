# 📄 Documentation & Specifications
**Always run `scripts/codex-setp.sh` before executing any tests to start local services.**
Record every feature in docs\client-features.yaml.
- While multiple AIs may code in parallel, review documents frequently to avoid overlapping features or contradictory explanations.
- Continuously reference and update past best practices so they remain current.
- Keep the implementation plan documentation updated whenever changes occur.

# 🧪 Test implementation and execution policy
For every feature, create a corresponding test.
Make the expected values ​​used for pass/fail judgments strict; longer test-execution time is acceptable if that is the consequence.
Do not embed code that skips tests.
Do not use mocks in tests.
Run tests in headless mode.
Fix one test file at a time and run tests after each fix to confirm.

# 🔍 How to deal with test failures
Whenever you modify code or tests, always run the affected tests to verify the fix.
If a test fails, do not adjust the test to match the implementation. First confirm that the test’s expectations align with the specification; if they do, fix the implementation.
🌐 E2E tests & test environment
In E2E tests, do not assume that something “cannot run in the test environment.” If it fails, either adjust the implementation or prepare the environment so that it runs. When the cause of E2E failure is unclear, investigate with Playwright MCP. 
Before concluding that the test server is not running, check with 
((curl http://localhost:7090/) -join "n").Substring(0, 100) (limit to 100 characters). 
If a specific test does not start, inspect the server log at server\logs\svelte-kit.log.

# 🛠️ Code style & quality 
Use undefined instead of null. 
Do not create duplicate functions in multiple locations. 
The use of page.waitForLoadState("networkidle"); is prohibited. 
Process synchronously whenever possible.
Please write git branch names, commit messages, etc. in English.

# ⚙️ Development workflow 
At the end of your work, create the first prompt for the next session so you can continue smoothly. Even if issues remain, carry over the known problems. Focus on writing a prompt that makes the next session effective rather than describing today’s work. 
State in the prompt that tasks should be progressed sequentially.
Write the prompt as plain text.

# ⚡ Performance & Reactivity
Ensure Svelte HTML elements update reactively.
Prefer patterns that update reactive variables asynchronously.
Prioritize performance.


# Testing Framework
- Tests should be documented in docs/client-features.yaml with specific naming conventions (CLM-0100, SLR-0002, FMT-0001, etc.) and test file names should match the corresponding feature ID.
- Tests should retrieve SharedTree content and cursor information in JSON format using treeValidation.ts and cursorValidation.ts, with real SharedTree data rather than mocks.
- For E2E tests, call TestHelpers.prepareTestEnvironment(page) in test.beforeEach and use Playwright's expect(locator).toBeVisible() pattern instead of manual DOM selection checks.
- For E2E tests that need to call client-side code, use page.evaluate through helper classes (like TestHelpers) rather than calling client code directly or writing page.evaluate inline in test files.
- Create projects and pages programmatically via fluidClient reference rather than through the UI which is unstable.
- When tests fail, prioritize fixing the implementation to match test expectations rather than modifying the tests.
- When tests fail due to navigation or functionality issues, fix the implementation or test method rather than just modifying tests to pass.
- For clipboard testing, use actual clipboard API operations which only work in HTTPS or localhost environments.
- Delete existing accessible containers before creating new test containers to ensure a clean test environment.
- User prefers fixing test files one by one with immediate test execution after each fix, and wants continuation prompts created at session end that focus on remaining issues rather than completed work.
- For cursor position testing, always use CursorValidator.getCursorData(page) instead of global-textarea cursor position, as they represent different things in the application.
- When Playwright tests show setup messages and then display test results with 'passed' status, the tests are executing successfully - don't assume execution problems based on setup warnings about emulator connections.
- When selecting items in tests, use data-item-id instead of index-based selection like .nth(1).
- User prefers absolute paths instead of 'cd client' commands, dislikes auto-opening browsers for HTML reports, and wants file output for test results but with proper encoding to prevent character corruption.
- For test execution, use the file output method with UTF-8 encoding to avoid character corruption, and never use nth() for element selection in tests - use data-item-id or other specific selectors instead.
- For link testing, first test within current project, verify new page creation in fluid container data before testing links, and create helper functions for data verification if they don't exist.
- When Playwright test output cannot be read directly, use cmd /c with output redirection to save results to a file and then read the file: cmd /c "cd /d path && npx playwright test ... > test-output.txt 2>&1 && type test-output.txt"
- When terminal output cannot be retrieved properly, it causes repeated dysfunction and prevents effective debugging and test execution.
- When fixing LNK-0003 tests, modifications broke 113 other tests including core cursor movement, text input, formatting, and selection functionality - need to be careful about regressions when making changes to core editor functionality.
- For E2E tests, use page.keyboard.type() for user input simulation; only use internal methods or event dispatching for data preparation and verification, never for simulating user actions.
- For E2E tests, use editorStore.setCursor({itemId, offset, isActive, userId}) for cursor creation, cursor.insertText() for text input, 500ms wait after text input, and waitForCursorVisible() for focus management - this pattern was successful for LNK-0003 and should be applied to other failing tests.
- For E2E tests, work sequentially through test phases.
- For E2E tests with internal links and cursor management, use editorStore.setCursor() for cursor creation, cursor.insertText() for text input with 500ms wait, waitForCursorVisible() for focus management, and apply these patterns sequentially to LNK-0002, LNK-0004, LNK-0006, and SLR-0009 tests.

# Test Environment Configuration
- E2E tests should run on both Windows and Ubuntu, with configurations for localhost (7090/7091/7092).
- Firebase emulators run in Docker containers.
- Firebase Auth emulator should be called only once at 192.168.50.13:59099, and duplicate environment variables like VITE_AUTH_EMULATOR_HOST and VITE_FIREbase_EMULATOR_HOST should be consolidated.
- For VSCode Playwright extension, directly modify isLocalhostEnv in playwright.config.ts as environment variables aren't reliably passed.
- When tests aren't progressing, check server-side logs (server/logs/test-svelte-kit.log or server/logs/localhost-svelte-kit.log).
- User has set up test users in server/auth-service.js and wants to clear all Firestore emulator data during development.
- Always use environment variables for emulator host configuration instead of hardcoding IP addresses like 192.168.50.13, as CI environments will have different host values.
- User prefers fixing import.meta environment variable loading issues at the root cause rather than using error handling workarounds.
- Always run `scripts/codex-setp.sh` when the container starts to set up local test services.

# Cursor and Selection Management
- Key files: Cursor.ts, EditorOverlay.svelte, EditorOverlayStore.svelte.ts, OutlinerItem.svelte.
- User is centralizing cursor management by moving logic to Cursor.ts, with EditorOverlayStore handling state management.
- When moving to previous/next item with up/down arrows, cursor should maintain x-coordinate position that minimizes change from initial position.
- For visual line movement in the outliner, Range API is used for line detection, items never contain newline characters (only CSS wrapping), and up/down arrow movement should navigate between visual lines while maintaining cursor position, falling back to item start/end when no previous/next item exists.
- For visual line calculation in cursor movement, the necessary information is already available from the existing cursor positioning system that correctly displays cursors with text wrapping.
- Selection range (SLR) functionality is separate from cursor movement (CLM), including Shift+arrow selection and mouse drag.
- User is implementing box selection features (rectangular selection with mouse, enhanced copy/paste for rectangular selections).

# Formatting and Links
- The outliner implements Scrapbox syntax formatting: bold [[text]], italic [/ text], strikthrough [- text], code `text`.
- Formatting should only display in non-active items, while active items show plain text with control characters show plain text with control characters visible.
- In Scrapbox syntax, [https://url] format is for external links while [link] format is for internal links to other pages.
- The outliner application implements internal links in [page-name] and [/project-name/page-name] formats with SvelteKit routing (/[project]/[page]).
- Internal links should be handled through routing mechanisms rather than click event handlers to support cases where internal links are called from external sources.
- When navigating to a non-existent page via an internal link, the page should only be added to the SharedTree upon user editing, not simply upon accessing the page.

# Item Handling
- In the outliner application, a single item never contains newline characters - when newlines are present, the content is automatically split into multiple separate items.

# Development and Code Organization
- User prefers using Svelte 5's $derived feature for derived state like isEditing rather than maintaining separate state variables.
- User prefers using $state instead of Writable in stores, and wants to make components reactive by directly referencing state variables instead of using getter functions.
- Svelte's $state rune can only be used inside .svelte and .svelte.js/ts files, not in regular .ts files.
- User prefers keeping $effect blocks short (ideally around 3 lines, maximum 10 lines) to avoid confusing bugs.
- User prefers initializing in onMount rather than $effect.
- User prefers organizing code with SharedTree elements in [project]/+layout.svelte, authentication and error handling in root +layout.svelte, page lists in [project]/+page.svelte, and individual pages in [project]/[page]/+page.svelte.
- API calls should be implemented in fluidService module and then called from other components rather than implementing them directly in components.
- User prefers implementing a function in fluidService.ts that returns a FluidClient based on project title, to be used in [project]/+layout.svelte.
- Rename getFluidClientByProjectName to getFluidClientByProjectTitle and modify it to search through clientRegistry for containers where Project.title matches the provided name.
- Rename firestoreStore.ts to firestoreStore.svelte.ts to enable using $state runes, and don't abandon requirements implementation.
- User prefers using direct export pattern (export const userManager = new UserManager()) instead of singleton pattern with getInstance() method for manager classes.
- User prefers using $derived.by with async map operations for container lists rather than $effect with IIFE pattern, and wants to know how to communicate such specific code structure preferences clearly.
- User prefers clear, specific instructions when requesting code implementations: specify exact patterns (like $derived.by), mention functions to use/avoid, show expected structure, and explicitly state what to avoid (like async patterns when sync is needed).

# Deployment and Firebase Configuration
- User plans to deploy to Firebase Hosting + Functions with only /api/fluid-token and /api/save-container needing implementation in Firebase Functions.
- The Firebase project is deployed at https://outliner-d57b0.web.app with project console at https://console.firebase.google.com/project/outliner-d57b0/overview.
- For Firebase Functions v2, environment variables should be set using .env files instead of functions.config() method.
- Authentication service needs to be migrated from server/auth-service.js to Firebase Functions, and client-side code needs to be updated accordingly.
- User prefers using Firebase Functions exclusively and wants to remove conditional API path selection.
- Firebase Functions are accessed through Firebase Hosting at http://localhost:57000/api instead of http://localhost:7090/api.
- Sensitive keys and credentials should not be hardcoded in the source code, especially in repositories that are committed to git.

# Project Configuration
- Projects should use 'title' not 'name'.
- Project ID should be the same as its Fluid container ID (1:1 relationship).
- Projects don't have separate IDs from their containers.
- User prefers titles without bold formatting and temporary pages without notification UI.
