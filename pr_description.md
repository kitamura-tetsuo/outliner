[Issues]
Currently, the `Ctrl+Home` and `Ctrl+End` (with and without Shift) keyboard shortcuts incorrectly navigate to the start and end of the current line. According to standard text editor conventions, they should navigate to the start and end of the document, respectively.

[Changes]
* Modified `client/src/lib/Cursor.ts` inside the `event.ctrlKey || event.metaKey` block.
* Updated `Home` key to call `extendSelectionToDocumentStart()` when `Shift` is pressed, and `moveToDocumentStart()` otherwise.
* Updated `End` key to call `extendSelectionToDocumentEnd()` when `Shift` is pressed, and `moveToDocumentEnd()` otherwise.

[Verification Results]
* Verified standard `npm run test:unit` and `npm run test:integration` pass in the `client` workspace.
* Ran locally and tested in Playwright (using temporary scripts) to verify the fix resolves the navigation logic appropriately for document-level traversal when using `Ctrl+Home` / `Ctrl+End`.
