1. **Add `getLocalCursorInstances` to `EditorOverlayStore`**
   - Add a method in `client/src/stores/EditorOverlayStore.svelte.ts` that filters `this.cursorInstances` to only those with `userId === "local" || userId == null`.

2. **Update `KeyEventHandler.ts` to use local cursors**
   - Replace most usages of `store.getCursorInstances()` with `store.getLocalCursorInstances()` in `client/src/lib/KeyEventHandler.ts`. This applies to typing, Enter, arrows, IME, copy/paste, etc., to avoid applying local edits to remote presence cursors.
   - We will need to review all usages of `getCursorInstances` in `KeyEventHandler.ts` to see if they should be replaced. Specifically:
     - `KeyEventHandler.handleInput`
     - `KeyEventHandler.handleCompositionUpdate`
     - `KeyEventHandler.handleCompositionEnd`
     - `KeyEventHandler.handleCopy`
     - `KeyEventHandler.handleBoxSelection`
     - `KeyEventHandler.handlePaste`
     - `KeyEventHandler.handleCut`
     - Anywhere `cursorInstances[0]` is used, it should be changed to use a local cursor (e.g. `getLocalCursorInstances()[0]` or `getLocalPrimaryCursor()`).
     - Initialization of key maps (`keyHandlers`).

3. **Update `EditorOverlay.svelte` if necessary**
   - We should verify if there is any place using `getCursorInstances` that should use `getLocalCursorInstances` (e.g. `cursors[0].deleteSelection()` in `handleCut`).

4. **Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.**
   - Run tests. E.g. `npm run test:unit`, `npm run test:e2e` if possible.

5. **Submit the change.**
