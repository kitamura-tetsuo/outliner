# Palette's Journal

## 2025-12-12 - [Outliner Item Accessibility Pattern]

**Learning:** The main `outliner-item` component uses a `div` with `onclick` for interaction (selection/editing) but lacks `role="button"` or `tabindex`. This suggests keyboard interaction is handled globally or via a hidden textarea, which might be confusing for screen reader users who navigate by touch or virtual cursor.
**Action:** Future accessibility improvements should focus on properly exposing the item's interactive nature to AT, possibly by adding `role="treeitem"` or similar, since it's an outliner.

## 2025-12-13 - [Simplifying Conditional ARIA with $derived]

**Learning:** Complex visibility logic used in templates (like `{#if ...}`) should be extracted to `$derived` variables. This not only cleans up the template but makes it trivial to reuse the logic for ARIA attributes like `aria-expanded` and `aria-label`.
**Action:** Extract conditional logic into `$derived` state before adding ARIA attributes.

## 2025-12-14 - [Virtual Focus with Aria-Activedescendant]

**Learning:** When using a hidden global textarea to capture input for a custom tree/list control, standard focus management is tricky because the user's "virtual" focus is on an item, but real focus is on the textarea.
**Action:** Use `aria-activedescendant` on the hidden textarea pointing to the ID of the active `role="treeitem"`. This bridges the gap, allowing screen readers to announce the active item while the textarea handles input.
