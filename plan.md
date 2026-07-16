1. Import `userManager` in `client/src/components/Sidebar.svelte`.
2. In the "Add new page" button `onclick` handler, loop to generate a non-colliding title like "Untitled", "Untitled 2", "Untitled 3", etc.
3. Replace the hardcoded `"tester"` author with `userManager.getCurrentUser()?.id ?? "anonymous"`.
