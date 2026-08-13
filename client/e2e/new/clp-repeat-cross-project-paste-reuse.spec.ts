/** @feature CLP-4584c0de */
import { expect, test } from "@playwright/test";
import {
    clickItemAndWaitForCursor,
    configureGrid,
    copyGridHosts,
    createBlankGrid,
    openProjectPage,
    pasteAtAnchor,
    readGridProjectState,
    seedCrossProjectFixture,
} from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

const SOURCE_SCHEMA =
    "CREATE TABLE contacts (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n  quantity INTEGER,\n  done BOOLEAN\n)";
const SOURCE_QUERY = "SELECT id, title, quantity, done FROM contacts";

test.describe("cross-project Grid clone reuse", () => {
    test.beforeEach(async ({ page }) => {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    });

    test("a later, separate paste operation offers reuse", async ({ page }, testInfo) => {
        test.setTimeout(180000);
        const fixture = await seedCrossProjectFixture(page, testInfo);

        await createBlankGrid(page, "Contacts", "contacts");
        await configureGrid(page, 0, SOURCE_SCHEMA, SOURCE_QUERY, "Contact title");
        await copyGridHosts(page);

        await openProjectPage(page, fixture, "destination");

        await createBlankGrid(page, "Warmup", "warmup_table");
        const warmupState = await readGridProjectState(page);
        expect(warmupState.tables).toHaveLength(1);

        await pasteAtAnchor(page, 2);
        const afterFirstPaste = await readGridProjectState(page);
        expect(afterFirstPaste.tables).toHaveLength(2);

        await clickItemAndWaitForCursor(
            page,
            page.locator(".outliner-item[data-item-id]").first().locator(".item-content"),
        );
        await page.keyboard.press("Control+v");

        const unconfiguredBlock = page.getByTestId("yjs-table-block").filter({
            has: page.getByTestId("yjs-table-create-panel"),
        });
        await expect(unconfiguredBlock).toBeVisible({ timeout: 60000 });

        const existingTab = unconfiguredBlock.locator(".mode-tab", { hasText: "Existing Table" });
        await expect(existingTab).toBeVisible();
        await existingTab.click();

        await expect(unconfiguredBlock.getByTestId("yjs-table-existing-select")).toBeVisible();

        await unconfiguredBlock.getByTestId("yjs-table-select-existing").click();

        await expect(page.getByTestId("yjs-table-view")).toHaveCount(3, { timeout: 60000 });

        const afterSecondPaste = await readGridProjectState(page);
        expect(afterSecondPaste.tables).toHaveLength(2);
        expect(new Set(afterSecondPaste.hostTableIds).size).toBe(3);
    });
});
