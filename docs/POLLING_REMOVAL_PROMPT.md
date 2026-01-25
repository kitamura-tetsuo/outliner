# Polling Removal Request Prompt

## Basic Prompt (Recommended)

```
Please remove polling in [filename].

1. Identify polling with npm run analyze:polling
2. Replace each polling with a reactive pattern
3. Verify no regression with tests

If there is a regression in tests, please analyze and report why polling is necessary.
```

## Detailed Prompt (For complex cases)

```
Please remove unnecessary polling in [filename] and verify there is no regression in tests.

Procedure:
1. Identify polling in the target file with npm run analyze:polling
2. For each polling:
   - setInterval/setTimeout → Svelte $derived/$effect or Yjs observe
   - requestAnimationFrame → MutationObserver/ResizeObserver (if possible)
3. Run tests:
   - npm run test:unit
   - npm run test:e2e:basic
   - Related E2E tests
4. If there is regression:
   - Analyze why polling is necessary
   - Consider alternative means
   - Report results

If there is a regression in tests, implement a method to improve the discrimination accuracy of polling.
```

## Usage Examples

### Single File

```
Please remove polling in OutlinerItemAlias.svelte.

1. Identify polling with npm run analyze:polling
2. Replace each polling with a reactive pattern
3. Verify no regression with tests

If there is a regression in tests, please analyze and report why polling is necessary.
```

### Multiple Files

```
Please remove polling in the following files:
- CommentThread.svelte
- EditorOverlay.svelte

1. Identify polling with npm run analyze:polling
2. Replace each polling with a reactive pattern
3. Verify no regression with tests

If there is a regression in tests, please analyze and report why polling is necessary.
```

### Specific Polling Type

```
Please remove the position update polling (16ms interval) in EditorOverlay.svelte.

1. Identify polling with npm run analyze:polling
2. Replace with MutationObserver or ResizeObserver
3. Verify no regression with tests

If there is a regression in tests, please analyze and report why polling is necessary.
```

## Replacement Patterns

### setInterval/setTimeout → Svelte Reactivity

**Before Removal**:

```typescript
setInterval(() => {
    const value = someStore.getValue();
    if (value) {
        updateDOM(value);
    }
}, 100);
```

**After Removal**:

```typescript
let reactiveValue = $derived(someStore.getValue());

$effect(() => {
    if (reactiveValue) {
        updateDOM(reactiveValue);
    }
});
```

### setInterval/setTimeout → Yjs observe

**Before Removal**:

```typescript
setInterval(() => {
    const value = ymap.get("key");
    if (value !== lastValue) {
        lastValue = value;
        updateUI(value);
    }
}, 100);
```

**After Removal**:

```typescript
onMount(() => {
    const observer = (event) => {
        if (event.keysChanged.has("key")) {
            const value = ymap.get("key");
            updateUI(value);
        }
    };
    ymap.observe(observer);
    observer(); // Initial sync
    onDestroy(() => ymap.unobserve(observer));
});
```

### requestAnimationFrame → MutationObserver

**Before Removal**:

```typescript
function checkPosition() {
    const rect = element.getBoundingClientRect();
    updatePosition(rect);
    requestAnimationFrame(checkPosition);
}
requestAnimationFrame(checkPosition);
```

**After Removal**:

```typescript
const observer = new MutationObserver(() => {
    const rect = element.getBoundingClientRect();
    updatePosition(rect);
});
observer.observe(element, {
    attributes: true,
    childList: true,
    subtree: true,
});
onDestroy(() => observer.disconnect());
```

## Notes

### Polling that MUST NOT be removed

In the following cases, polling may be necessary:

1. **Processes dependent on browser rendering cycles**
   - Multiple attempts at focus setting
   - Setting cursor position
   - Example: `requestAnimationFrame(() => { setTimeout(() => { element.focus(); }, 10); })`

2. **Polling external systems**
   - Log rotation (periodic execution required)
   - Idle timeout (processing after a certain time)
   - Example: `setInterval(() => { rotateLog(); }, 3600000);`

3. **Cursor blinking**
   - Necessary as UI expression
   - Example: `setInterval(() => { toggleCursor(); }, 500);`

### Handling Test Regressions

If tests fail:

1. **Reconfirm the purpose of polling**
   - Check comments and commit history
   - Why was polling introduced?

2. **Consider alternative means**
   - Is event-based implementation possible?
   - Can the observer pattern be used?
   - Can the reactive system handle it?

3. **Determine necessity**
   - Is polling really necessary?
   - Is it not a problem on the test side?
   - Is it a workaround specific to E2E?

4. **Report results**
   - Reason why polling is necessary
   - Result of considering alternative means
   - Recommended action

## Reference Information

- [Polling Analysis Guide](./POLLING_ANALYSIS_GUIDE.md)
- [Polling Removal Workflow](./POLLING_REMOVAL_WORKFLOW.md)
- [Polling Removal Results](./POLLING_REMOVAL_RESULTS.md)
- [Polling Tool Index](./POLLING_TOOLS_INDEX.md)
