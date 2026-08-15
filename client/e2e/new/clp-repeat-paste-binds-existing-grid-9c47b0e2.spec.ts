/** @feature CLP-4584c0de */
import { expect, test } from "@playwright/test";
import {
    clickItemAndWaitForCursor,
    copyGridHosts,
    createBlankGrid,
    openProjectPage,
    pasteAtAnchor,
    readGridProjectState,
    seedCrossProjectFixture,
} from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// Spec §9.3: a table records where it was cloned from, and a repeat paste of
// the same clipboard binds its host to that table rather than creating a
// second one. Before this, the host was pasted unbound and the page showed an
// empty create panel where the Grid should have been.
test.describe("pasting the same Grid into a project twice", () => {
    test.beforeEach(async ({ page }) => {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    test("binds the second copy to the table the first one created", async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await seedCrossProjectFixture(page, testInfo);

        await createBlankGrid(page, "Contacts", "contacts");
        await copyGridHosts(page);

        await openProjectPage(page, fixture, "destination");
        await pasteAtAnchor(page, 1);

        const afterFirstPaste = await readGridProjectState(page);
        expect(afterFirstPaste.tables).toHaveLength(1);
        const clonedTableId = afterFirstPaste.tables[0].id;

        await clickItemAndWaitForCursor(
            page,
            page.locator(".outliner-item[data-item-id]").first().locator(".item-content"),
        );
        await page.keyboard.press("Control+v");

        // The second host renders a Grid of its own, and no create panel is
        // offered: the binding was decided by provenance.
        await expect(page.getByTestId("yjs-table-view")).toHaveCount(2, { timeout: 60000 });
        await expect(page.getByTestId("yjs-table-create-panel")).toHaveCount(0);

        const afterSecondPaste = await readGridProjectState(page);
        expect(afterSecondPaste.tables).toHaveLength(1);
        expect(afterSecondPaste.hostTableIds).toEqual([clonedTableId, clonedTableId]);
    });
});
