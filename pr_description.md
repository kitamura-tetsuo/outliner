[Issues]
The `SearchPanel` used a global `svelte:window` listener for the Escape key, which caused it to close unintentionally when users pressed Escape elsewhere on the page, such as when typing in the editor or dismissing a context menu.

[Changes]
- Scoped the Escape key handling directly to `SearchPanel.svelte` using `document.activeElement`.
- Ensures the panel only closes if the user is explicitly focused within the SearchPanel itself, or if they aren't actively focused on another `INPUT`, `TEXTAREA`, or `contenteditable` element, preventing global interference and preserving simultaneous editor interaction.

[Verification Results]
Ran `svelte-check` successfully. Tested formatting and the build process. No regressions found.
