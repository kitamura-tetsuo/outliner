1. **Update `client/src/schema/yjs-schema.ts` `Item` class:**
   - Add a `get votes(): Y.Array<string>` accessor to the `Item` class. If the `"votes"` field is undefined, initialize it with a new `Y.Array<string>()` and return it.
   - Add a `toggleVote(user: string)` method to the `Item` class. This method will fetch the `votes` array, check if the user is already in it, and either push the user or remove the user. It must update the `"lastChanged"` property of the item (`this.value.set("lastChanged", Date.now())`) to ensure UI reactivity.

2. **Update `client/src/schema/app-schema.ts` `Item` class:**
   - Modify the `toggleVote(user: string)` method in `client/src/schema/app-schema.ts` to also update the `"lastChanged"` property (`this.value.set("lastChanged", Date.now())`).

3. **Ensure stable anonymous voter identity:**
   - Currently, unauthenticated users share the ID `"anonymous"` (see `client/src/components/OutlinerTree.svelte`). This causes vote stealing. Update `client/src/components/OutlinerTree.svelte` so that when `userManager.getCurrentUser()` is null, instead of using `"anonymous"`, it checks `sessionStorage` (or `localStorage`) for a generated anonymous ID. If not present, generate one (e.g., `"anon-" + Math.random().toString(36).substring(2, 9)`), save it, and use it. This will provide a stable per-user identity for anonymous voters on the public demo page.
   - To do this, I will create a simple helper in `OutlinerTree.svelte` (or `client/src/utils`) to get or create an anonymous ID.

4. **Add tests:**
   - Add a unit test to `client/tests/schema/yjs-schema.test.ts` to verify `toggleVote` adds/removes a user and updates `lastChanged`.
   - Add an E2E test `client/e2e/basic/item-voting.spec.ts` that navigates to a new page, creates an item, clicks the vote button, asserts the `.vote-count` badge becomes visible and correct, and clicking again removes the vote. Or use the demo page directly as stated in the issue.

5. **Run all tests & pre-commit steps:**
   - Run `npm run test:unit --prefix client` and `npm run test:e2e:basic --prefix client`.
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.

6. **Submit changes.**
