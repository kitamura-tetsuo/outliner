# Polling Analysis and Removal Guide

This guide explains how to identify and remove unnecessary polling in the codebase.

## Overview

There are numerous polling processes using `setInterval`, `setTimeout`, and `requestAnimationFrame` in the codebase. Among them are:

- **Necessary Polling**: Clear purpose such as cursor blinking, log rotation, etc.
- **Unnecessary Polling**: Remnants of trial and error, E2E test workarounds, etc.
- **Replaceable Polling**: Can be replaced with Yjs observer or Svelte reactivity.

This toolset automatically analyzes these and identifies pollings that can be safely removed.

## Tool Composition

### 1. Static Analysis Tool (`analyze-polling.ts`)

Scans the codebase to detect and classify all polling processes.

**Execution Method:**

```bash
npm run analyze:polling
```

**Output:**

- `docs/polling-analysis-report.md`: Analysis report

**Classification:**

- **Necessary Polling**: Should not be removed
- **Suspicious Polling**: Candidates for removal
- **Test-Only Polling**: Executed only in test environments

### 2. Runtime Monitoring Tool (`pollingMonitor.ts`)

Intercepts and tracks polling calls within the browser.

**Usage:**

```typescript
import { pollingMonitor } from "$lib/pollingMonitor";

// Start monitoring
pollingMonitor.start();

// Get statistics
const stats = pollingMonitor.getStats();
console.log(stats);

// Generate report
console.log(pollingMonitor.generateReport());
```

### 3. E2E Test Helper (`pollingTestHelper.ts`)

Executes tests with specific pollings disabled to check the impact.

**Usage:**

```typescript
import { testWithoutPolling } from "../utils/pollingTestHelper";

const result = await testWithoutPolling(
    page,
    "Test name",
    /Filename.*PollingIdentifier/,
    async () => {
        // Test code
    },
);

// If result.isRemovable is true, it can be removed
```

### 4. Polling Removability Test

Actually disables polling and runs E2E tests.

**Execution Method:**

```bash
npm run test:polling
```

**Output:**

- `docs/polling-removability-report.md`: Removability report

## Usage Workflow

### Step 1: Run Static Analysis

```bash
cd client
npm run analyze:polling
```

This generates `docs/polling-analysis-report.md`.

### Step 2: Review Analysis Report

Open `docs/polling-analysis-report.md` and check:

- Review the **Suspicious Polling** section intensively
- Check the context of each polling
- List removal candidates

### Step 3: Run Removability Test

```bash
cd client
npm run test:polling
```

This disables each suspicious polling and runs tests.

### Step 4: Review Test Results

Open `docs/polling-removability-report.md` and:

- Check the **Removable Polling** section
- These are pollings where tests passed even when disabled
- High possibility that they can be safely removed

### Step 5: Remove Polling

Actually remove the polling determined to be removable.

**Example: Polling at line 340 of OutlinerItem.svelte**

Before Removal:

```typescript
onMount(() => {
    const iv = setInterval(() => {
        // Polling process
    }, 100);
    onDestroy(() => clearInterval(iv));
});
```

After Removal:

```typescript
// Remove polling and replace with Yjs observe
onMount(() => {
    const observer = () => {
        // Same process
    };
    ymap.observe(observer);
    onDestroy(() => ymap.unobserve(observer));
});
```

### Step 6: Run Full Test Suite

```bash
cd client
npm test
```

Ensure all tests pass.

## Classification Criteria

### Necessary Polling

Pollings with the following characteristics should not be removed:

- Cursor blinking (530ms interval)
- Log rotation (12 hour interval)
- Idle timeout monitoring
- Purpose is explained with clear comments

### Suspicious Polling (Removal Candidates)

Removal should be considered for pollings with the following characteristics:

- Short interval (<200ms)
- Comments like "fallback", "tentative", "E2E stabilization"
- No clear purpose
- Appears to be a remnant of trial and error

### Test-Only Polling

Pollings with the following characteristics are executed only in test environments:

- Within `__E2E__` or `VITE_IS_TEST` conditional branches
- E2E test workarounds
- Processes needed only in test environments

## Alternative Means to Polling

### 1. Yjs Observer

Use Yjs observe instead of polling:

```typescript
// Before: Polling
setInterval(() => {
    const value = ymap.get("key");
    localState = value;
}, 100);

// After: Yjs observe
ymap.observe((event) => {
    if (event.keysChanged.has("key")) {
        localState = ymap.get("key");
    }
});
```

### 2. Svelte 5 Reactivity

Use Svelte 5's `$derived` instead of polling:

```typescript
// Before: Polling
let value = $state(0);
setInterval(() => {
    value = store.getValue();
}, 100);

// After: $derived
let value = $derived(store.getValue());
```

### 3. MutationObserver

When monitoring DOM changes:

```typescript
// Before: Polling
setInterval(() => {
    const el = document.querySelector(".target");
    if (el) updatePosition(el);
}, 16);

// After: MutationObserver
const observer = new MutationObserver(() => {
    const el = document.querySelector(".target");
    if (el) updatePosition(el);
});
observer.observe(document.body, { childList: true, subtree: true });
```

## Troubleshooting

### If Tests Fail

1. **Polling is actually necessary**
   - Move to "Necessary Polling" section of the report
   - Do not remove

2. **Alternative means is incomplete**
   - Check if completely replaced by Yjs observe or Svelte reactivity
   - Check initialization timing

3. **Issue specific to test environment**
   - If it fails only in test environment, consider fixing the test side

### If Polling is Not Detected

1. **Dynamically generated polling**
   - Use Runtime Monitoring Tool
   - Run `window.__pollingMonitor.getStats()` in browser console

2. **External library polling**
   - Out of scope for analysis (exclude node_modules)
   - Manually check if necessary

## Best Practices

1. **Remove Incrementally**
   - Do not remove many pollings at once
   - Remove one by one and run tests

2. **Separate Commits**
   - Make each polling removal a separate commit
   - Make it easy to rollback

3. **Document Reasons**
   - Explain reason in comments if removal is not possible
   - For future developers

4. **Run Regularly**
   - Check regularly if new pollings are added
   - Consider incorporating into CI/CD

## Reference Information

- [AGENTS.md](../AGENTS.md) - Project guidelines
- [docs/dev-features/pol-polling-analysis-and-removal-tool-a1b2c3d4.yaml](./dev-features/pol-polling-analysis-and-removal-tool-a1b2c3d4.yaml) - Feature specifications
- [Yjs Documentation](https://docs.yjs.dev/) - Details on Yjs observe
- [Svelte 5 Runes](https://svelte.dev/docs/svelte/$derived) - Details on Svelte reactivity
