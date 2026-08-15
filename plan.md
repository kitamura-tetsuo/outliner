1. **Create `client/src/utils/pageTitleUtils.ts`**:
   - Create a `allocatePageTitle(proposedTitle: string, currentItemId: string | undefined, pageExists: (name: string, excludeId?: string) => boolean)` function that trims the proposed title, sets it to `Untitled` if empty, checks for collisions, and appends `_n` where `n` starts at 2, using the `pageExists` check but excluding the `currentItemId` if applicable.
   - Use `read_file` to confirm the file is created correctly.

2. **Update `client/src/components/Sidebar.svelte`**:
   - Replace local `Untitled` / `Untitled n` logic with `allocatePageTitle(title, undefined, (name) => store.pageExists(name))`.

3. **Update `client/src/components/PageList.svelte`**:
   - Near the line where `project.addPage(pageTitle, currentUser)` is called, replace `pageTitle = ""` check with `const safeTitle = allocatePageTitle(pageTitle, undefined, (name) => store.pageExists(name));` and use `safeTitle` in `project.addPage`.

4. **Update `client/src/lib/cursor/CursorEditor.ts`**:
   - In `validateRename`, return `true` for empty strings. Keep the error if title contains `/`.
   - In `insertText`, `deleteBackward`, and `deleteForward`, if the text becomes empty after processing, generate a new title with `allocatePageTitle` and wrap the text update in `store.project.ydoc.transact()`.

5. **Update `client/src/components/OutlinerItem.svelte`**:
   - In the inline handler for `oninput` related to `isPageTitle`, remove the empty title rejection. If `trimmed` is empty, generate a title with `allocatePageTitle` and set `model.original.updateText(newTitle)`.

6. **Deterministic Repair (`client/src/lib/projectPageLoader.ts`)**:
   - In `loadProjectAndPage`, before the line `const findPage = () => {` (which exists at line 62), iterate over `project.items` using `iterateItems`. For any item with an empty or whitespace-only title, assign it a new title using `allocatePageTitle` and persist it via `item.updateText()`. Use `item.id` to tie break by sorting items with empty titles by their ID before applying `allocatePageTitle`.

7. **Update Navigation (`client/src/routes/[project]/[page]/+page.svelte` and `client/src/routes/demo/[page]/+page.svelte`)**:
   - In `[project]/[page]/+page.svelte`, add a `$effect` that monitors `store.currentPage?.text`. If it changes, compare it against `pageName` and call `goto(resolvePath(\`/\${projectName}/\${newPageName}\`), { replaceState: true })`.
   - Do the same in `demo/[page]/+page.svelte` (which uses `DEMO_PROJECT_NAME`).

8. **Verify Changes**:
   - Run unit tests by executing `cd client && npm run test:unit` and run the relevant Playwright tests with `cd client && npx playwright test`. Ensure no regressions are introduced.

9. **Pre-commit Instructions**:
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
