# E2E Test Debugging Guide

Essential knowledge for debugging flaky E2E tests and common pitfalls.

## Common Issues and Solutions

### 1. Firestore Permission Errors

**Symptom**: `PERMISSION_DENIED` errors when tests try to write to Firestore

**Root Cause**: Security rules in `firestore.rules` may be outdated or too restrictive for test environment

**Solution**: Ensure `firestore.rules` allows authenticated users to write their own data:

```javascript
match /userProjects/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

### 2. Data Persistence & Navigation Timing

**Symptom**: Tests timeout waiting for data after calling `page.goto()`, or `setAccessibleProjects` seems to have no effect.

**Root Cause**:

1. In-memory store state is lost when the page reloads.
2. Firestore emulator persistence can be flaky/slow, so data written _before_ navigation might not be ready on reload.

**Solution**:

1. **Navigate FIRST, then Seed**: Navigate to the target page, _then_ call `setAccessibleProjects` or `prepareTestEnvironment`. This updates the _active_ in-memory store of the running page, guaranteeing immediate availability without relying on persistence.
2. If you must navigate after seeding, ensure data is explicitly persisted to Firestore (see example below), but method #1 is more robust.

```typescript
// ✅ Robust Pattern: Navigate first, then seed in-memory
await page.goto("http://localhost:7090/");
await TestHelpers.setAccessibleProjects(page, ["project-1"]);
```

### 3. Race Conditions with Authentication

**Symptom**: Tests use `"test-user-id"` instead of actual authenticated user ID, causing data mismatches

**Root Cause**: Test helpers execute before authentication completes

**Solution**: Wait for `currentUser` to be populated:

```typescript
// Wait for stores to initialize
await page.waitForFunction(
    () => !!(window as any).__FIRESTORE_STORE__ && !!(window as any).__USER_MANAGER__,
    { timeout: 15000 },
);

// Wait for actual user login
await page.waitForFunction(
    () => !!(window as any).__USER_MANAGER__?.auth?.currentUser,
    { timeout: 5000 },
);

// Now safe to use currentUser.uid
const userId = um?.auth?.currentUser?.uid || "test-user-id";
```

### 4. Missing Console Listeners

**Symptom**: `E2E_ATTACH_BROWSER_CONSOLE=1` doesn't show browser logs for some tests

**Root Cause**: `prepareTestEnvironmentForProject` lacks console event listeners

**Solution**: Add console listeners to all test environment setup functions:

```typescript
if (process.env.E2E_ATTACH_BROWSER_CONSOLE === "1") {
    page.on("console", (msg) => {
        console.log(`[BROWSER-CONSOLE:${msg.type()}]`, msg.text());
    });
    page.on("pageerror", (err) => {
        console.log("[BROWSER-PAGEERROR]", err?.message || String(err));
    });
}
```

### 5. Blocking on Cursor Visibility (Avoid waitForUIStable)

**Symptom**: Tests timeout in `TestHelpers.waitForUIStable()` during comment interactions or navigation.

**Root Cause**: `waitForUIStable` waits for cursor visibility/stability. However, during navigation, graph view, or specific UI interactions, the cursor logic (Prosemirror) might not be active or stable, causing false positives.

**Solution**: Avoid `waitForUIStable` in general. Use specific functional waits:

```typescript
// ❌ Avoid broad waits
await TestHelpers.waitForUIStable(page);

// ✅ Wait for specific data/elements
await TestHelpers.waitForOutlinerItems(page);
await page.locator(".my-element").waitFor({ state: "visible" });

// ✅ Wait for store state (see #9)
await page.waitForFunction(() => !!(window as any).generalStore?.currentPage);
```

### 6. Playwright Execution Hangs (CDP Port Conflict)

**Symptom**: `npx playwright test` hangs indefinitely at "Running 1 test using 1 worker" without starting the test body or producing logs.

**Root Cause**: Conflict on the default Chrome Debugger Protocol (CDP) port (9222), possibly due to zombie processes or other tools using the port.

**Solution**: Kill stale processes and/or use a custom port:

```bash
# 1. Kill stale processes
pkill -f playwright
pkill -f chromium

# 2. Run with custom CDP port
CDP_PORT=9333 npx playwright test <test-file>
```

### 7. Yjs Synchronization Failures

**Symptom**: Multi-client tests fail to sync data (e.g., `page2` sees 0 items) even though no errors are logged.

**Root Cause**: Tests asserting state before the Yjs client has fully connected and hydrated data. `idle_timeout` logs on the server are often normal and can be ignored.

**Solution**: Explicitly wait for connection and item counts:

```typescript
// Wait for Yjs connection status on the client
await page.waitForFunction(() => !!(window as any).__YJS_STORE__?.isConnected, { timeout: 30000 });

// ✅ Improved: Wait for both connection and initial data hydration
await page.waitForFunction(() => {
    const store = (window as any).__YJS_STORE__;
    return store?.isConnected && document.querySelectorAll(".outliner-item[data-item-id]").length >= 1;
}, { timeout: 60000 });

// Wait for specific item count
await TestHelpers.waitForItemCount(page, expectedCount);
```

### 8. Authentication Mismatches (Yjs Auth)

**Symptom**: Yjs connection errors, "0 items" found, or immediate disconnection in multi-client tests.

**Root Cause**: Server requires authentication (`VITE_YJS_REQUIRE_AUTH=true` or similar server-side check) but the test client is connecting anonymously or without the flag.

**Solution**: Ensure `VITE_YJS_REQUIRE_AUTH` is set to "true" in `localStorage` in the test setup (via `addInitScript` or `prepareTestEnvironment`), so clients verify their auth token during the Yjs handshake.

```typescript
await page.addInitScript(() => {
    localStorage.setItem("VITE_YJS_REQUIRE_AUTH", "true");
    // ... other flags
});
```

### 9. Store Initialization Race Conditions

**Symptom**: "Failed to read properties of undefined" (e.g. `generalStore.currentPage`) immediately after navigation.

**Root Cause**: Accessing global stores (`window.generalStore`) before the app has hydrated.

**Solution**: Always guard store access with a waitForFunction.

```typescript
// Wait for store to be populated before access
await page.waitForFunction(() => !!(window as any).generalStore?.currentPage);
const project = await page.evaluate(() => (window as any).generalStore.project);
```

### 10. Premature Interaction with List Items

**Symptom**: Test fails at `locator.click()` or `innerHTML` check on outliner items, often with a timeout, even after `prepareTestEnvironment`.

**Root Cause**: The test attempts to assert or interact with items immediately after navigation or seeding, but the list rendering (Svelte/Yjs) hasn't completed or hydrated. `getItemIdByIndex` may temporarily return null during initial render.

**Solution**: Always wait for specific items to be visible/attached before touching them, and add retry logic for IDs.

```typescript
// ❌ Dangerous
await page.locator(".outliner-item").first().click();

// ✅ Safe: Wait for list to populate
await TestHelpers.waitForOutlinerItems(page);

// ✅ Robust: Add retry for IDs (if getting null errors)
let itemId = await TestHelpers.getItemIdByIndex(page, 1);
if (!itemId) {
    await page.waitForTimeout(500);
    itemId = await TestHelpers.getItemIdByIndex(page, 1);
}

// ✅ Interactive: Wait for visibility before clicking (crucial in beforeEach)
const item = page.locator(".outliner-item").first();
await item.waitFor({ state: "visible" });
await item.locator(".item-content").click({ force: true });
```

### 11. Environment Variable Mismatches

**Symptom**: Config-related tests fail with unexpected values (e.g., Project ID mismatch).

**Root Cause**: Values in `.env.test` or CI secrets differ from hardcoded test expectations.

**Solution**: Ensure test expectations match `.env.test`. Do not hardcode environment-dependent values in `expect()` unless they are guaranteed constants.

```typescript
// ❌ Hardcoded expectation
expect(projectId).toBe("test-project-id");

// ✅ Match configuration (update test or .env.test)
// Check .env.test for the actual value used in test mode
expect(projectId).toBe("outliner-d57b0");
```

### 12. Selector Updates (Container vs Project)

**Symptom**: Tests fail to find elements (e.g., "Element not found" for `select.container-select`) after code refactors.

**Root Cause**: UI components were updated (e.g., `container-select` -> `project-select`) but tests still target old class names.

**Solution**: Verify the actual DOM class names in the component file and update test locators.

```typescript
// ❌ Old selector
page.locator(".container-select");

// ✅ Updated selector
page.locator(".project-select");
```

### 13. Sync Before Navigation (Import/Export)

**Symptom**: Exported files (OPML/Markdown) are empty or missing recent items.

**Root Cause**: Navigating to another page (e.g., `/settings`) immediately after seeding interrupts the Yjs sync, so local state is incomplete.

**Solution**: Force a wait for items to be present in the logic layer before navigating away.

```typescript
// Create data...
// ✅ Wait for sync to happen
await TestHelpers.waitForOutlinerItems(page);

// Then navigate
await page.goto(`/${encoded}/settings`);

// ✅ Critical: Ensure Yjs connection is re-established after navigation
// Pages like GraphView.svelte or settings/+page.svelte need explicit connection logic in onMount
await page.waitForFunction(() => (window as any).__YJS_STORE__?.isConnected, { timeout: 30000 });
```

### 14. Heavy Test Timeouts

**Symptom**: Complex tests (Comment threads, Collab) timeout in CI but pass locally.

**Root Cause**: CI environments are slower; heavy operations (creation, sync, edit, delete) take longer than default 30s-60s.

**Solution**: Increase timeout specifically for heavy tests.

```typescript
test("heavy operation", async ({ page }) => {
    test.setTimeout(120000); // 2 minutes
    // ...
});
```

### 15. Redundant Navigation / Environment Setup

**Symptom**: `beforeEach` hook timeouts or weird race conditions where the page is blank or "Not Found" during the test.

**Root Cause**: Calling `prepareTestEnvironment` in both `beforeEach` AND the test body. This triggers two navigations. If the second starts before the first one settles (or while Yjs is connecting), it can cause navigation loops or initialization failures.

**Solution**: Use ONE `prepareTestEnvironment` call per test execution. If most tests share a setup, keep it in `beforeEach`. If tests need specific data (lines), remove it from `beforeEach` and call it explicitly inside each test.

```typescript
// ❌ Redundant setup leads to race conditions
test.beforeEach(async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);
});
test("my test", async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo, ["data"]);
    // ...
});

// ✅ Better: Isolate setup if data varies
test("my test with data", async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo, ["specific data"]);
    // ...
});
```

### 16. Default Seeding & Item Counts

**Symptom**: `TestHelpers.waitForItemCount(page, 2)` timeouts even if the page seems to load.

**Root Cause**: By default, `prepareTestEnvironment` (with no lines) only creates the **page title** (Index 0). Accessing `nth(1)` or waiting for 2 items will fail if no content lines were seeded.

**Solution**: If your test interacts with "the first content line", seed at least one blank line to ensure the item exists.

```typescript
// Seed an empty string to ensure Title + 1st body line exist
await TestHelpers.prepareTestEnvironment(page, testInfo, [""]);
await TestHelpers.waitForItemCount(page, 2); // Title(0) + Body(1)
```

### 17. Waiting for Complex Renderers (ScrapboxFormatter)

**Symptom**: `page.locator("a.internal-link")` counts 0 items, even after `waitForOutlinerItems`.

**Root Cause**: Content items might be "visible" as text, but specific link conversion (ScrapboxFormatter) runs asynchronously or slightly after initial render.

**Solution**: Use `page.waitForSelector` for the specific transformed elements.

```typescript
// Wait for outliner items generally
await TestHelpers.waitForOutlinerItems(page);
// AND specifically wait for link rendering
await page.waitForSelector("a.internal-link", { timeout: 10000 });
```

### 18. Prevention of TypeError: "Cannot read properties of undefined"

**Symptom**: Application crashes or test fails with `TypeError: Cannot read properties of undefined (reading 'text')` during page navigation or import.

**Root Cause**: Accessing `items[0]` on a Yjs-backed list before it is wrapped with a Proxy or before the first item exists.

**Solution**:

1. **Schema Layer**: Ensure `v.items` returns a Proxy-wrapped object (using `wrapArrayLike`) so `[index]` access is safe.
2. **Logic Layer**: Use `.at(0)` or defensive checks.

```typescript
const firstPage = currentProject.items.at ? currentProject.items.at(0) : currentProject.items[0];
if (!firstPage) return;
const pageName = typeof firstPage.text === "function" ? firstPage.text() : firstPage.text;
```

### 19. Flaky Text Selection & Formatting

**Symptom**: Text formatting tests fail because only the first character is formatted (e.g., `[[T]]his` instead of `[[This]]`), or selection assertions fail randomly.

**Root Cause**: Simulating character-by-character selection (e.g., a loop of `Shift+ArrowRight`) is flaky in CI buffers. The application state may not sync with the DOM selection fast enough between key presses.

**Solution**: Use robust, native selection shortcuts that select chunks of text in one go, such as **Line Selection** (`Shift+End`) or **Word Selection** (`Control+Shift+ArrowRight`).

```typescript
// ❌ Flaky Loop
for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Shift+ArrowRight");
}

// ✅ Robust Line Selection
await page.keyboard.press("Shift+End");
```

### 20. Editor State Synchronization (WaitForFunction)

**Symptom**: Formatting commands (Ctrl+B, etc.) seem to be ignored or applied incorrectly even after text appears selected.

**Root Cause**: Use of `page.waitForTimeout` is often insufficient. The DOM selection might look correct, but the internal application store (e.g., `editorOverlayStore`) hasn't processed the selection update yet.

**Solution**: Explicitly wait for the internal store to report the expected selection state before performing the action.

```typescript
// Select text...
await page.keyboard.press("Shift+End");

// ✅ Wait for app state to match DOM selection
await page.waitForFunction(
    () => {
        const store = (window as any).editorOverlayStore;
        return store && store.getSelectedText().includes("This");
    },
    null,
    { timeout: 3000 },
);

// Now safe to format
await page.keyboard.press("Control+b");
```

### 21. Restricted Globals (window)

**Symptom**: Lint errors/warnings: `Unexpected use of 'window'. Do not access 'window' in E2E tests.`

**Root Cause**: E2E tests often need to access `window` to interact with global stores (e.g., `(window as any).generalStore`) or services for validation and synchronization. The linter flags this as `no-restricted-globals` to discourage coupling to global state, but it is sometimes necessary in E2E tests.

**Solution**: Explicitly suppress the warning using `// eslint-disable-next-line no-restricted-globals` when such access is intentional and necessary for testing purposes (like verifying store state).

```typescript
// ✅ Intentional window access
// eslint-disable-next-line no-restricted-globals
const store = (window as any).generalStore;
```

### 22. Reliable Search Inputs (fill vs pressSequentially)

**Symptom**: Search box tests fail in CI, either timing out or finding no results, despite working locally.

**Root Cause**: `pressSequentially` key presses may be dropped or processed too quickly for Svelte reactivity in constrained CI environments. `fill` is instantaneous but doesn't trigger all keyboard events.

**Solution**: Use `fill()` to set the value reliably, then trigger `Space` + `Backspace` to force strict reactivity updates.

```typescript
// ❌ Flaky in CI
await searchInput.pressSequentially("query", { delay: 100 });

// ✅ Robust: Fill + Event Trigger
await searchInput.fill("query");
await searchInput.press("Space");
await searchInput.press("Backspace");
await page.waitForTimeout(1000); // Allow reactivity
```

### 23. Robust Input Clearing (Fallback)

**Symptom**: `expect(input).toHaveValue("")` fails with received value "hello", even after sending `Control+A` + `Backspace`.

**Root Cause**: Focus loss or timing issues can interrupt the "Select All + Delete" sequence.

**Solution**: Implement a retry loop or use `fill("")` as a forceful fallback to guarantee a clean state.

```typescript
// ✅ Robust Clearing with Fallback
const clearDeadline = Date.now() + 5000;
while (Date.now() < clearDeadline) {
    await input.press("Control+A");
    await input.press("Backspace");
    if (await input.inputValue() === "") break;

    // Fallback if keyboard fails
    if (Date.now() > clearDeadline - 1000) await input.fill("");
    await page.waitForTimeout(200);
}
```

### 24. Page Closure Safety (waitForTimeout)

**Symptom**: `page.waitForTimeout` throws "Target page, context or browser has been closed" during a test or teardown.

**Root Cause**: A race condition where the browser context closes (e.g., test error, navigation out) while a timeout is still pending.

**Solution**: Guard critical waits with `!page.isClosed()`.

```typescript
if (!page.isClosed()) {
    await page.waitForTimeout(2000);
}
```

### 25. Hydration Wait for Sidebar/Stores

**Symptom**: `waitForPagesList` or store checks fail/timeout immediately on page load.

**Root Cause**: The global store (`window.generalStore`) may not be initialized yet when the test script resumes execution after navigation.

**Solution**: Wait for `networkidle` or check store existence before accessing properties.

```typescript
// ✅ Ensure hydration before store access
await page.waitForLoadState("networkidle").catch(() => {});
await TestHelpers.waitForPagesList(page);
```

### 26. Optimizing Test Setup (SRP-0001)

**Symptom**: `beforeEach` hook timeouts (e.g., > 120s) in specific tests.

**Root Cause**: Creating too many pages or items (heavy seeding) in the `beforeEach` hook overwhelms the CI environment, causing subsequent tests to drift or fail.

**Solution**: Reduce dataset size. Use strictly necessary data for the test case. Avoid "stress tests" in the main E2E suite unless isolated.

### 27. Test-Mode Authentication (Mock Tokens)

**Symptom**: Yjs connection fails (`ws_connection_denied`) or `firebase.auth()` throws network errors in test environments, especially when the Firebase Emulator is flaky.

**Root Cause**: E2E tests often run in environments (like limited CI containers) where the Firebase Auth Emulator is offline or unreachable via standard `getIdToken()`, yet the server requires a token for the WebSocket handshake.

**Solution**:

1. **Client**: Implement a fallback in `getFreshIdToken` to generate a self-signed "Mock Token" (`alg:none`) when `VITE_IS_TEST` is true and standard auth fails.
2. **Server**: Update `server/src/websocket-auth.ts` to explicitly allow `alg:none` tokens when running in `TEST_ENV`.

```typescript
// Connection.ts (Conceptual)
try {
    token = await auth.currentUser.getIdToken(true);
} catch (e) {
    if (isTestEnv) {
        // Fallback: Generate mock token accepted by server in test mode
        token = generateMockToken({ uid: "test-user", alg: "none" });
    }
}
```

### 28. Ensuring Seeding Persistence

**Symptom**: `seed-api-verify` passes the HTTP seed request, but when the test client connects slightly later, it sees an empty document (0 items). Server logs show `bytes: 0` for the persisted update.

**Root Cause**: The seeding API modifies an in-memory Yjs doc. If no WebSocket clients are connected at that exact moment, `y-leveldb` might not automatically flush these changes to disk immediately. When the test client connects later, it gets the stale (empty) state from disk.

**Solution**: Force manual persistence in the seeding logic.

```typescript
// Server seed-api.ts
const update = Y.encodeStateAsUpdate(doc);
// FORCE storage even if using in-memory doc
await persistence.storeUpdate(roomName, update);
```

### 29. Dynamic Port Configuration (LocalStorage)

**Symptom**: E2E tests fail to connect to Yjs (`ECONNREFUSED` on port 1234) because the server launched on a different ephemeral port (e.g., 7082).

**Root Cause**: Hardcoding ports in `.env.test` is brittle if the test runner or parallel workers choose different ports. `import.meta.env` values are baked in at build time.

**Solution**:

1. **Test Runner**: Write the desired port to `localStorage` in `beforeEach`.
2. **Client Code**: Prioritize `localStorage` over environment variables for port selection.

```typescript
// 1. Playwright Setup
await page.addInitScript(() => {
    window.localStorage.setItem("VITE_YJS_PORT", "7082");
});

// 2. Client Connection.ts
const port = window.localStorage.getItem("VITE_YJS_PORT") || import.meta.env.VITE_YJS_PORT;
```
