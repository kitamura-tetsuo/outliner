## 2025-12-13 - [OutlinerItem Layout Thrashing]

**Learning:** `getClickPosition` in `OutlinerItem` was performing O(N) layout thrashing (creating span, setting text, measuring width) for every character on every click/drag. This fallback was being hit because `document.caretRangeFromPoint` returns local offsets which didn't match the global text index expected by the component.
**Action:** When implementing custom text rendering (like rich text overlays), ensure cursor mapping logic handles the mismatch between DOM structure and raw text index efficiently (e.g., by traversing DOM length) rather than relying on expensive measurement loops.

## 2025-12-15 - [ScrapboxFormatter Optimization]

**Learning:** `ScrapboxFormatter` was running expensive regex replacements for every item render, even for plain text. Also, `OutlinerItem` was using `{#key}` with a frequently updating store property (`overlayPulse`), causing full DOM destruction/recreation on every cursor move.
**Action:** Use `$derived` to memoize expensive computations in Svelte 5. Avoid `{#key}` wrappers around lightweight updates; rely on fine-grained reactivity instead. Add fast-path checks (like `hasFormatting`) before running expensive parsing logic.

## 2025-12-19 - [Text Measurement with Range API]
**Learning:** Measuring text width using `textContent` updates in a binary search loop causes massive layout thrashing (O(log N) reflows). Using `Range.getBoundingClientRect()` allows measuring substrings without modifying the DOM, eliminating reflows entirely during the search.
**Action:** When needing to measure partial text widths (e.g., for custom cursor positioning), use a single hidden element and manipulate a `Range` object instead of repeatedly updating `textContent` or creating new elements.
