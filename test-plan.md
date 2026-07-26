1. **Analyze the Issue:**
   - The issue describes a bug where public demo tables and scheduled SQL pages are gated behind authentication, even though the demo workspace `/demo` is meant to be public and readable by anyone.
   - The `Sidebar.svelte` component links to `/tables/demo/<table>` and `/schedules/demo/<ruleId>`.
   - The root cause is a blanket `isAuthenticated = userManager.getCurrentUser() !== null;` check in these standalone pages (`client/src/routes/tables/[project]/[table]/+page.svelte`, `client/src/routes/schedules/[project]/[ruleId]/+page.svelte`, and `client/src/routes/tables/[project]/[table]/schedule/+page.svelte`).
   - The suggestion is to check if it's the demo project (like the `/demo` routes do) and allow read-only (or read-write, consistent with the outline pages) access if so. In this app, demo is currently full read-write as mentioned in docs. We should allow access if `projectName === DEMO_PROJECT_NAME`.

2. **File Modifications:**
   - **`client/src/routes/tables/[project]/[table]/+page.svelte`**:
     - Import `DEMO_PROJECT_NAME`.
     - Update `isAuthenticated` on mount and in loadTable or handle auth logic: we could set `isAuthenticated = userManager.getCurrentUser() !== null || projectName === DEMO_PROJECT_NAME;`. However, `projectName` is derived from `$page.params.project`.
     - So, `isAuthenticated = userManager.getCurrentUser() !== null || projectName === DEMO_PROJECT_NAME;` inside an `$effect` or just change the check to `const hasAccess = isAuthenticated || projectName === DEMO_PROJECT_NAME;`.
   - **`client/src/routes/tables/[project]/[table]/schedule/+page.svelte`**:
     - Do the same.
   - **`client/src/routes/schedules/[project]/[ruleId]/+page.svelte`**:
     - Do the same.

3. **Verify Behavior:**
   - Pre-commit verification will be run.

4. **Pre-commit Instructions:**
   - Ensure proper testing, verification, review, and reflection are done.

5. **Submit Change:**
   - Call the `submit` tool to finalize the fix.
