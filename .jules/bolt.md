## 2025-12-13 - [OutlinerItem Layout Thrashing]

**Learning:** `getClickPosition` in `OutlinerItem` was performing O(N) layout thrashing (creating span, setting text, measuring width) for every character on every click/drag. This fallback was being hit because `document.caretRangeFromPoint` returns local offsets which didn't match the global text index expected by the component.
**Action:** When implementing custom text rendering (like rich text overlays), ensure cursor mapping logic handles the mismatch between DOM structure and raw text index efficiently (e.g., by traversing DOM length) rather than relying on expensive measurement loops.

## 2025-12-15 - [ScrapboxFormatter Optimization]

**Learning:** `ScrapboxFormatter` was running expensive regex replacements for every item render, even for plain text. Also, `OutlinerItem` was using `{#key}` with a frequently updating store property (`overlayPulse`), causing full DOM destruction/recreation on every cursor move.
**Action:** Use `$derived` to memoize expensive computations in Svelte 5. Avoid `{#key}` wrappers around lightweight updates; rely on fine-grained reactivity instead. Add fast-path checks (like `hasFormatting`) before running expensive parsing logic.

## 2025-05-20 - [ScrapboxFormatter Regex Caching and Fast Path]

**Learning:** `ScrapboxFormatter.hasFormatting` was creating new RegExp objects on every call and checking them even for plain text. Implementing a fast path using `String.prototype.includes` for format trigger characters (`[`, `]`, `` ` ``, `<`, `>`) and caching regexes as static constants improved performance by ~36% in synthetic benchmarks.
**Action:** Always verify if expensive operations like Regex checks can be skipped with cheap string checks (fast path) and cache compiled regexes where possible.

## 2025-06-03 - [Items Iteration O(N^2)]

**Learning:** The `Items` class in `app-schema.ts` had an iteration complexity of O(N^2) because `at(index)` called `childrenKeys()` which sorted keys on every call. Changing the iterator to sort once and iterate improved performance by ~500x.
**Action:** When implementing iterators or indexed access on sorted collections, ensure that the sort operation is cached or performed once per iteration, rather than per element access.

## 2025-10-27 - [Page Existence Check Optimization]

**Learning:** `ScrapboxFormatter.checkPageExists` was performing O(N) iteration over all pages for every internal link in every item, resulting in O(M*N) complexity. Replacing this with a cached `Set<string>` in `GeneralStore` reduces lookup to O(1) and eliminates the iteration overhead during rendering.
**Action:** When performing frequent existence checks in rendering loops, prefer caching with O(1) lookup structures (Set/Map) and maintain them via event listeners (e.g., Yjs observers) rather than iterating arrays on every render.

## 2026-01-18 - [OutlinerViewModel Update Optimization]

**Learning:** `OutlinerViewModel.updateFromModel` was converting every item's `Y.Text` to string (`item.text.toString()`) on every tree update (triggered by `observeDeep`), which is O(N) for the whole tree. `Y.Text.toString()` involves traversing the Yjs structure and is expensive when done repeatedly for thousands of items.
**Action:** Use `item.lastChanged` timestamp to skip property updates if the item hasn't changed since the last view model update.

## 2026-02-15 - [Graph Construction Optimization]

**Learning:** `buildGraph` in `graphUtils.ts` was performing O(N^2) `RegExp` construction for link detection. This created millions of temporary RegExp objects for large graphs.
**Action:** Pre-calculate lowercase names for all nodes and use simple string `includes()` checks instead of RegExp. Only use RegExp when complex pattern matching is strictly necessary; for simple substring containment, `includes` is orders of magnitude faster.

## 2026-03-01 - [Recursive Formatter Fast Path]

**Learning:** `ScrapboxFormatter.formatToHtmlAdvanced` creates many temporary strings during recursive processing (`processFormat`). Adding a fast path check (`!hasFormatting`) inside the recursion significantly reduces overhead for plain text segments (like link labels and quote content) which were previously subjected to all regex replacements.
**Action:** In recursive string processing functions, check if the recursion can be terminated early or skipped using a cheap pre-check (like `includes` or `hasFormatting`) on the substring.

## 2026-03-02 - [Sequential Regex Optimization]

**Learning:** `ScrapboxFormatter.processFormat` was executing multiple regex `replace` calls sequentially for every formatted segment, even if the triggering characters (like `[/`, `[-`, `` ` ``) were absent. Adding `includes()` checks before each specific `replace` call reduced the overhead by ~26% in benchmarks.
**Action:** When applying a series of regex replacements, use `String.prototype.includes()` to verify the presence of triggering substrings before invoking the regex engine.

## 2026-03-03 - [Backlink Collection Iteration Optimization]

**Learning:** `collectBacklinks` was iterating `store.pages.current` using the default iterator, which triggered O(N log N) sorting of page keys. Using `iterateUnordered` avoids this sort, reducing complexity to O(N).
**Action:** When iterating over `Items` or similar Yjs-backed collections where order is not strictly required, always prefer `iterateUnordered` to avoid implicit sorting overhead.
