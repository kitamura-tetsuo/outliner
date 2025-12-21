## 2024-05-23 - Semantic Navigation Links

**Learning:** Navigation items implemented as `div`s with JS handlers require manual accessibility implementation and miss native browser features.
**Action:** Use `<a>` tags for all navigation items, using CSS to reset styles if necessary.

## 2024-05-24 - Expanded State Accessibility

**Learning:** Collapsible sections like `BacklinkPanel` often miss `aria-expanded` and `aria-controls`, leaving screen reader users unaware of the state change.
**Action:** Always pair toggle buttons with `aria-expanded` and `aria-controls` pointing to the content region.
