/** @feature CLP-4584c0de */
import { expect, test } from "@playwright/test";
import {
    clickItemAndWaitForCursor,
    createBlankGrid,
    openProjectPage,
    readGridProjectState,
    seedCrossProjectFixture,
} from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// #4816 follow-up: copying a whole page with Ctrl+A and pasting it into another
// project used to clone the Grid's table but paste nothing at all. The Ctrl+A
// selection stayed in the editor store across the navigation, and the paste
// handler tried to replace a selection whose items do not exist in the
// destination page, so it silently gave up and left an orphaned table behind.
test.describe("select-all copy of a page containing a Grid, pasted across projects", () => {
    test.beforeEach(async ({ page }) => {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    test("pastes every copied line and the Grid into the destination project", async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await seedCrossProjectFixture(page, testInfo);

        await createBlankGrid(page, "Orders", "orders");
        const sourceState = await readGridProjectState(page);
        expect(sourceState.tables).toHaveLength(1);

        // Copy the whole page with the real keyboard shortcuts.
        await page.locator(".outliner-item[data-item-id]").first().click();
        await page.locator("textarea.global-textarea").focus();
        await page.keyboard.press("Control+a");
        await page.keyboard.press("Control+c");
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 15000 })
            .toContain("Source anchor");

        await openProjectPage(page, fixture, "destination");

        // The copy-time selection must not survive the navigation: it points at
        // items of the source page that this page cannot resolve.
        await expect.poll(
            () => page.evaluate(() => Object.keys((globalThis as any).editorOverlayStore.selections).length),
            { timeout: 15000 },
        ).toBe(0);

        await clickItemAndWaitForCursor(
            page,
            page.locator(".outliner-item[data-item-id]").nth(1).locator(".item-content"),
        );
        await page.keyboard.press("Control+v");

        // The Grid is cloned into the destination project and rendered there.
        await expect(page.getByTestId("yjs-table-view")).toHaveCount(1, { timeout: 60000 });
        const destinationState = await readGridProjectState(page);
        expect(destinationState.guid).not.toBe(sourceState.guid);
        expect(destinationState.tables).toHaveLength(1);
        const clone = destinationState.tables[0];
        expect(clone.id).not.toBe(sourceState.tables[0].id);
        expect(clone.name).toBe("Orders");
        expect(clone.sqlName).toBe("orders");
        expect(clone.dataSize).toBe(0);
        // The pasted host item is bound to the clone, not to the source table.
        expect(destinationState.hostTableIds).toEqual([clone.id]);

        // The plain lines of the copied page are pasted as well.
        const texts = await page.locator(".outliner-item[data-item-id] .item-text").allTextContents();
        const joined = texts.join("\n");
        expect(joined).toContain("Source anchor");
        expect(joined).toContain("Source tail");
    });
});
