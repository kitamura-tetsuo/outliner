1. **Fix `getFreshIdToken` in `client/src/lib/yjs/connection.ts`:**
   - Remove the `mustAuth` condition when waiting for `auth.currentUser`. The code should be `if (!auth.currentUser) { ... }` instead of `if (!auth.currentUser && mustAuth) { ... }`.
   - I will use `replace_with_git_merge_diff` to apply this fix.

2. **Add a unit test in `client/src/tests/unit/yjs/connectionSharedSetup.spec.ts`:**
   - Add a test checking that when `auth.currentUser` is initially null (simulating a cold start), the application waits and rechecks it instead of immediately failing.
   - I will dynamically change `userManager.auth.currentUser` in the test to be null initially, and then use `setTimeout` or `vi.advanceTimersByTimeAsync` to simulate it hydrating (being populated with an object that has `getIdToken`) after ~1s. We expect `provider.configuration.token()` to wait and eventually return the token rather than returning empty.
   - Wait, `userManager` is exported as a module variable mock. We need to make it writable or change its `auth` property in the test. The mock currently has `auth: { currentUser: { getIdToken: ... } }`. We can do `userManager.auth.currentUser = null` initially, and then `setTimeout(() => { userManager.auth.currentUser = { getIdToken: ... } }, 1000)` using fake timers.
   - I will use `replace_with_git_merge_diff` to add this test.

3. **Complete pre-commit steps.**
   - Run `pre_commit_instructions` to ensure proper testing, verification, review, and reflection are done.

4. **Submit the change.**
   - Submit the change using the `submit` tool.
