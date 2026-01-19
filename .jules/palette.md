# Palette's Journal

## 2025-12-12 - [Outliner Item Accessibility Pattern]

**Learning:** The main `outliner-item` component uses a `div` with `onclick` for interaction (selection/editing) but lacks `role="button"` or `tabindex`. This suggests keyboard interaction is handled globally or via a hidden textarea, which might be confusing for screen reader users who navigate by touch or virtual cursor.
**Action:** Future accessibility improvements should focus on properly exposing the item's interactive nature to AT, possibly by adding `role="treeitem"` or similar, since it's an outliner.

## 2025-12-13 - [Simplifying Conditional ARIA with $derived]

**Learning:** Complex visibility logic used in templates (like `{#if ...}`) should be extracted to `$derived` variables. This not only cleans up the template but makes it trivial to reuse the logic for ARIA attributes like `aria-expanded` and `aria-label`.
**Action:** Extract conditional logic into `$derived` state before adding ARIA attributes.

## 2025-05-20 - [ARIA Combobox Discrepancy]

**Learning:** The `AGENTS.md` documentation claimed the `SearchBox` implemented the ARIA Combobox pattern, but the actual code used a simple input with a list of buttons. E2E tests verified visibility but not the specific ARIA roles, leading to a drift between documentation/expected accessibility standards and implementation.
**Action:** When `AGENTS.md` claims an accessibility pattern exists, verify it with `getByRole` in tests rather than generic selectors. If missing, implement the full pattern (combobox, listbox, option, activedescendant) to match the documentation and improve screen reader experience.

## 2026-01-17 - [Hybrid Listbox-Button Pattern]

**Learning:** When improving keyboard accessibility for a list of actionable items (like snapshots), converting them to a strict ARIA `listbox` pattern (`role="listbox"`, `role="option"`) works well for semantics. However, using `<button role="option">` inside the list preserves native keyboard behaviors (click on Enter/Space) while providing the correct semantics to screen readers, avoiding the need to manually reimplement all key handlers associated with a pure `div` based listbox.
**Action:** Use `<button role="option">` for actionable list items to get the best of both worlds: native interactivity and correct ARIA semantics.
