# Palette's Journal


## 2025-12-12 - [Outliner Item Accessibility Pattern]
**Learning:** The main `outliner-item` component uses a `div` with `onclick` for interaction (selection/editing) but lacks `role="button"` or `tabindex`. This suggests keyboard interaction is handled globally or via a hidden textarea, which might be confusing for screen reader users who navigate by touch or virtual cursor.
**Action:** Future accessibility improvements should focus on properly exposing the item's interactive nature to AT, possibly by adding `role="treeitem"` or similar, since it's an outliner.
