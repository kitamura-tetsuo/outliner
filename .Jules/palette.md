## 2024-05-23 - Semantic Navigation Links

**Learning:** Navigation items implemented as `div`s with JS handlers require manual accessibility implementation and miss native browser features.
**Action:** Use `<a>` tags for all navigation items, using CSS to reset styles if necessary.

## 2024-05-24 - Expanded State Accessibility

**Learning:** Collapsible sections like `BacklinkPanel` often miss `aria-expanded` and `aria-controls`, leaving screen reader users unaware of the state change.
**Action:** Always pair toggle buttons with `aria-expanded` and `aria-controls` pointing to the content region.

## 2025-05-20 - Mixed Language Contexts

**Learning:** The application has a mix of English and Japanese UI text, despite documentation claiming full localization. Changing core component labels to Japanese can be seen as a regression if surrounding components remain in English.
**Action:** When adding UX improvements to core components in a mixed-language codebase, prioritize visual enhancements (like icons) and maintain existing language unless explicitly instructed to localize. Verify consistency with immediate neighbors (e.g., Toolbar vs Sidebar).

## 2026-01-08 - Absolute Positioning in Responsive Containers

**Learning:** When adding absolutely positioned interactive elements (like a clear button) inside an input container, hardcoded dimensions on the input (`width: 340px`) can conflict with responsive container widths (`width: 100%`), causing misalignment.
**Action:** Ensure the input width matches the container width (`width: 100%`) so that absolute positioning relative to the container remains visually correct across different viewport sizes.

## 2026-01-09 - Semantic List Structure for Sidebar Navigation

**Learning:** Sidebar navigation lists implemented as `<div>`s lose the semantic benefit of list items (e.g., "List of X items") for screen readers.
**Action:** Use `<ul>` and `<li>` structure for lists of navigation links (like projects or pages) to provide better context for assistive technologies.

## 2025-02-20 - [ARIA Combobox implementation in Svelte 5]
**Learning:** Implementing the ARIA 1.2 Combobox pattern in a Svelte 5 component requires careful handling of reactive state for `aria-activedescendant`. Derived runes (`$derived`) are excellent for calculating the active ID string based on the selected index, but care must be taken to handle the case where the list is filtered or hidden.
**Action:** When implementing comboboxes in the future, use derived state to manage `aria-activedescendant` IDs dynamically, and ensure the list container and items have the correct roles (`listbox` and `option`).
