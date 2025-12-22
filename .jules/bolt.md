## 2025-12-13 - [OutlinerItem Layout Thrashing]

**Learning:** `getClickPosition` in `OutlinerItem` was performing O(N) layout thrashing (creating span, setting text, measuring width) for every character on every click/drag. This fallback was being hit because `document.caretRangeFromPoint` returns local offsets which didn't match the global text index expected by the component.
**Action:** When implementing custom text rendering (like rich text overlays), ensure cursor mapping logic handles the mismatch between DOM structure and raw text index efficiently (e.g., by traversing DOM length) rather than relying on expensive measurement loops.

## 2025-12-15 - [ScrapboxFormatter Optimization]

**Learning:** `ScrapboxFormatter` was running expensive regex replacements for every item render, even for plain text. Also, `OutlinerItem` was using `{#key}` with a frequently updating store property (`overlayPulse`), causing full DOM destruction/recreation on every cursor move.
**Action:** Use `$derived` to memoize expensive computations in Svelte 5. Avoid `{#key}` wrappers around lightweight updates; rely on fine-grained reactivity instead. Add fast-path checks (like `hasFormatting`) before running expensive parsing logic.

## 2025-05-20 - [ScrapboxFormatter Regex Caching and Fast Path]

**Learning:** `ScrapboxFormatter.hasFormatting` was creating new RegExp objects on every call and checking them even for plain text. Implementing a fast path using `String.prototype.includes` for format trigger characters (`[`, `]`, `` ` ``, `<`, `>`) and caching regexes as static constants improved performance by ~36% in synthetic benchmarks.
**Action:** Always verify if expensive operations like Regex checks can be skipped with cheap string checks (fast path) and cache compiled regexes where possible.

## 2025-05-24 - [Items Iterator Optimization]

**Learning:** The `Items` class iterator was calling `childrenKeys()` (which sorts keys) on every step via `at(index)`, resulting in O(N^2) complexity for iteration. This caused massive slowdowns (28s for 2000 items) when rendering lists or checking existence.
**Action:** When implementing iterators for sorted collections, ensure the sorted key list is fetched once (snapshot) at the start of iteration to achieve O(N) performance.
