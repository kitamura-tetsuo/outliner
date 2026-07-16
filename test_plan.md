1. The bug is that `Y.Doc` instance check `instanceof Y.Doc` in `tableDocs.ts` (`getTableHandles`) fails, returning `undefined` for `handles`, causing the Yjs table UI to get stuck on "Loading table...".
2. The fix is to change the check `!(doc instanceof Y.Doc)` to `!doc || typeof doc !== 'object' || !('load' in doc)`.
3. Apply the fix and verify unit tests.
4. Verify by checking if the table correctly loads using the UI check script.
5. `pre_commit_instructions`
6. `submit`
