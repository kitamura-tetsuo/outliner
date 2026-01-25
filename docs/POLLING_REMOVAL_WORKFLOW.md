# Polling Removal Workflow

## Overview

This document describes the specific steps to safely remove unnecessary polling using `docs/polling-analysis-report.md`.

## Current Status

Analysis results:

- **Total Polling Count**: 104
- **Suspicious Polling**: 78 (Candidates for removal)
- **Test-Only Polling**: 26

## Removal Priority

### High Priority (Remove Immediately)

1. **Short Interval Polling** (100ms or less)
   - High impact on performance
   - Often replaceable with Yjs observe or Svelte reactivity

2. **Polling marked as "Tentative" or "Fallback"**
   - Likely remnants of trial and error
   - Should be replaced with proper implementation

3. **Polling for E2E Stabilization**
   - Only needed in test environment
   - Unnecessary in production environment

### Medium Priority (Remove after Verification)

1. **Polling without clear purpose**
   - No comments or unclear
   - Remove and run tests to verify

2. **Duplicate Polling**
   - Multiple pollings existing for the same purpose
   - Consolidate or remove

### Low Priority (Consider Carefully)

1. **Long Interval Polling** (1 second or more)
   - Low impact on performance
   - Low priority for removal

## Removal Steps

### Step 1: Check Report

```bash
cd client
npm run analyze:polling
```

Open the generated report `docs/polling-analysis-report.md` and check the removal candidates.

### Step 2: Investigate Individual Polling

For each polling:

1. **Check Context**
   - Why does this polling exist?
   - Is there an alternative?

2. **Check Usage**
   ```bash
   cd client
   grep -r "setInterval" src/components/OutlinerItem.svelte
   ```

3. **Check Related Tests**
   ```bash
   cd client
   npm run test:e2e -- e2e/core/itm-*.spec.ts
   ```

### Step 3: Remove or Replace Polling

#### Pattern 1: Replace with Yjs Observe

**Before Removal:**

```typescript
onMount(() => {
    const iv = setInterval(() => {
        aliasTargetId = item.aliasTargetId;
    }, 100);
    onDestroy(() => clearInterval(iv));
});
```

**After Removal:**

```typescript
onMount(() => {
    const ymap = item.tree.getNodeValueFromKey(item.key);
    const observer = (event) => {
        if (event.keysChanged.has("aliasTargetId")) {
            aliasTargetId = ymap.get("aliasTargetId");
        }
    };
    ymap.observe(observer);
    onDestroy(() => ymap.unobserve(observer));
});
```

#### Pattern 2: Replace with Svelte $derived

**Before Removal:**

```typescript
let value = $state(0);
onMount(() => {
    const iv = setInterval(() => {
        value = store.getValue();
    }, 100);
    onDestroy(() => clearInterval(iv));
});
```

**After Removal:**

```typescript
let value = $derived(store.getValue());
```

#### Pattern 3: Simply Remove

**Before Removal:**

```typescript
// E2E stabilization: Poll input DOM value
onMount(() => {
    const iv = setInterval(() => {
        const inputEl = document.querySelector("input");
        if (inputEl?.value) {
            newText = inputEl.value;
        }
    }, 120);
    onDestroy(() => clearInterval(iv));
});
```

**After Removal:**

```typescript
// bind:value is sufficient
<input bind:value={newText} />;
```

### Step 4: Run Tests

Always run related tests after removal:

```bash
cd client

# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests (only relevant files)
npm run test:e2e -- e2e/core/itm-*.spec.ts

# Full test suite
npm test
```

### Step 5: Commit

If tests pass, commit the changes:

```bash
git add .
git commit -m "refactor: Remove unnecessary polling in OutlinerItem.svelte

- Replaced setInterval with Yjs observe for aliasTargetId
- Improves performance by reducing timer callbacks
- All tests passing"
```

## Specific Removal Candidates

### Top Priority: Polling in OutlinerItem.svelte

**File**: `client/src/components/OutlinerItem.svelte`

1. **Around line 340: aliasLastConfirmedPulse polling**
   - Interval: 100ms
   - Purpose: E2E stabilization
   - Alternative: Yjs observe + direct setting of data attributes
   - Recommendation: **Remove**

2. **Around line 1765: E2E file drop polling**
   - Interval: Unknown
   - Purpose: E2E test workaround
   - Alternative: Official Playwright file drop API
   - Recommendation: **Remove**

### High Priority: Polling in OutlinerItemAlias.svelte

**File**: `client/src/components/OutlinerItemAlias.svelte`

1. **Around line 50: aliasLastConfirmedPulse polling**
   - Interval: 100ms
   - Purpose: E2E stabilization
   - Alternative: Yjs observe
   - Recommendation: **Remove**

### High Priority: Polling in CommentThread.svelte

**File**: `client/src/components/CommentThread.svelte`

1. **Around line 147: Input value polling**
   - Interval: 120ms
   - Purpose: Handling environment where bind:value doesn't work
   - Alternative: Fix bind:value
   - Recommendation: **Remove**

### Medium Priority: Polling in EditorOverlay.svelte

**File**: `client/src/components/EditorOverlay.svelte`

1. **Around line 213: Position update polling**
   - Interval: 16ms (60fps)
   - Purpose: Cursor position update
   - Alternative: MutationObserver (Already implemented)
   - Recommendation: **Remove after verification**

## Troubleshooting

### If Tests Fail

1. **Check Error Message**
   ```bash
   cd client
   npm run test:e2e -- e2e/core/itm-*.spec.ts 2>&1 | tee test-output.log
   ```

2. **Verify if polling is really needed**
   - Temporarily revive polling and test
   - If successful, polling is necessary

3. **Check alternative implementation**
   - Is Yjs observe correctly configured?
   - Is initialization timing appropriate?

### If Performance Degrades

1. **Profile before and after polling removal**
   ```javascript
   // In browser console
   performance.mark("start");
   // Execute operation
   performance.mark("end");
   performance.measure("operation", "start", "end");
   console.log(performance.getEntriesByType("measure"));
   ```

2. **Optimize alternative implementation**
   - Event filtering for Yjs observe
   - Dependency optimization for $derived

## Progress Management

Use the following checklist to track removal progress:

### OutlinerItem.svelte

- [ ] aliasLastConfirmedPulse Polling (Line 340)
- [ ] E2E file drop polling (Line 1765)

### OutlinerItemAlias.svelte

- [ ] aliasLastConfirmedPulse Polling (Line 50)

### CommentThread.svelte

- [ ] Input value polling (Line 147)

### EditorOverlay.svelte

- [ ] Position update polling (Line 213)

### Others

- [ ] Automatic reset polling in Checklist.svelte
- [ ] Focus polling in AliasPicker.svelte
- [ ] Loading state polling in AuthComponent.svelte

## References

- [POLLING_ANALYSIS_GUIDE.md](./POLLING_ANALYSIS_GUIDE.md) - Detailed guide
- [polling-analysis-report.md](./polling-analysis-report.md) - Analysis report
- [AGENTS.md](../AGENTS.md) - Project guidelines
