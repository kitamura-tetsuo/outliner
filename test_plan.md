1. **Fix Outliner Item Layout Shrinking Issue**:
   - We observed that `.item-text` has `flex: 1` and `min-width: 1px`, and since controls (vote button, comment button, selector, item-actions) reserve space even when invisible (`opacity: 0`), `.item-text` is compressed on narrow screens.
   - We will update `client/src/components/OutlinerItem.svelte` to change `min-width: 1px` to `min-width: 60%` on `.item-text`. This forces the inline controls to wrap under `.item-text` since `.item-content` has `flex-wrap: wrap`.
   - In `client/src/components/OutlinerItem.svelte`, we'll add `flex-wrap: wrap;` to `.item-header` (line 2221) so the `.item-actions` container can also drop to the next line on narrow screens instead of forcing `.item-content-container` (and `.item-text`) to shrink further.
2. **Fix Mobile Header Wrap**:
   - In `client/src/components/Toolbar.svelte`, remove the fixed `height: 4rem` and replace it with `min-height: 4rem; height: auto;` to allow it to expand on mobile when `.main-toolbar-content` wraps.
   - In `client/src/routes/+layout.svelte`, increase the `padding-top` on `.main-content` for mobile viewports using `@media (max-width: 640px) { .main-content { padding-top: 8rem; } }` so the "Not signed in" header pill does not overlap the breadcrumb row when the toolbar expands.
3. **Run Checks and Tests**:
   - Run `cd client && unset npm_config_prefix && npm run check && npm run test:unit && npm run test:e2e:basic` and `cd server && unset npm_config_prefix && npm run build && npm run test` to verify changes.
4. **Complete Pre-commit Step**:
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
