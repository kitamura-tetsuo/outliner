# Improvement Plan

**Target Application:** Client source files
**Improvement Type:** Bug fix / Memory directive compliance

### Plan Details
1. **Fix `window.appStore` fallbacks:**
   - Modify `client/src/components/SearchPanel.svelte` to correctly use `window.appStore || window.generalStore`.
   - Modify `client/src/components/OutlinerItem.svelte` (around line 1517) to correctly use `window.appStore || window.generalStore`.
2. **Fix `stopPropagation` on interactive controls:**
   - Modify `client/src/components/OutlinerItem.svelte`'s action buttons (the `Add new item` and `Delete` buttons at line ~2317) to include `e.stopPropagation()` for `onclick`, `onmousedown`, `onpointerdown`, and `onmouseup`.
3. **Verify changes locally** (Pre-commit steps).

Let's check if there are other areas missing `stopPropagation` in `EditorOverlay.svelte` or `OutlinerItem.svelte`.
