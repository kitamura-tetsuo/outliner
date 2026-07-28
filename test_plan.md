1. **Fix `getFreshIdToken` in `client/src/lib/yjs/connection.ts`:**
   - Remove the `mustAuth` guard from the `if (!auth.currentUser && mustAuth)` check. It should just be `if (!auth.currentUser)`.
   - Update the comments to reflect this change.

2. **Add a test in `client/src/tests/unit/yjs/connectionSharedSetup.spec.ts`:**
   - The issue asks to "Add a unit test that stubs `auth.currentUser` as null and populates it after ~1s, asserting `getFreshIdToken` resolves with the real token rather than `""`."
   - Wait, `getFreshIdToken` isn't exported directly in the test file `connectionSharedSetup.spec.ts` but it's used indirectly through the token function `provider.configuration.token()`.
   - We can add the test to `client/src/tests/unit/yjs/connectionSharedSetup.spec.ts` by mocking `auth.currentUser` being null initially, then setting it after 1s in fake timers.

3. **Complete pre-commit steps.**
   - Ensure all testing, verifications, review, and reflection are done by calling `pre_commit_instructions`.

4. **Submit the change.**
   - Submit the branch with standard PR commands.
