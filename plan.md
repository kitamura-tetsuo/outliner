1. **Remove placeholder copy from `Sidebar.svelte`:**
   - Remove `<h2 class="sidebar-title">Sidebar</h2>` and `<p class="sidebar-description">This is a placeholder sidebar component.</p>` from `client/src/components/Sidebar.svelte`.
   - Update tests in `client/src/components/Sidebar.test.ts`: Remove the assertions that check for "Sidebar" (in `screen.getByText("Sidebar")`) and "This is a placeholder sidebar component." in the "should render the sidebar component" test.

2. **Update "Projects" section to show sign-in hint when anonymous:**
   - Import `authStore` from `../stores/authStore.svelte.ts` into `client/src/components/Sidebar.svelte`.
   - In the "Projects" section, conditionally render text:
     - If `!authStore.isAuthenticated`, show "Sign in to see your projects".
     - Else if `projectStore.projects.length === 0`, show "No projects available".
     - Else, render the projects list.
   - Update tests in `client/src/components/Sidebar.test.ts`:
     - Update "should render 'No projects available' when no projects" to set `authStore.isAuthenticated` to true.
     - Add a new test "should render 'Sign in to see your projects' when unauthenticated".

3. **Gate the "Jules" link behind a dev/test flag:**
   - Add a condition using `import.meta.env.MODE` to hide the Jules link in production in `client/src/components/Sidebar.svelte`.
   - `{#if import.meta.env.MODE !== 'production'}` around the "Jules" link.

4. **Run Tests:**
   - Run `cd client && unset npm_config_prefix && npm run check && npm run test:unit && npm run test:e2e:basic` and `cd server && unset npm_config_prefix && npm run build && npm run test`.

5. **Complete pre-commit steps:**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
