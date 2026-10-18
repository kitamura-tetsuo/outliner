/** @feature CLP-4584c0de */
import { expect, test } from "../fixtures/grid-render-trace";
import { readGridProjectState } from "../utils/crossProjectGridHelpers";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("select all clipboard with component blocks", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Alpha", "Block host", "Omega"]);
    });

    test("Ctrl+A copy then paste at the end repeats the Grid block", async ({ page }) => {
        const host = page.locator(".outliner-item").nth(2);
        await expect(host).toBeVisible();
        await host.click();
        const addDatabase = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
        await addDatabase.click();
        await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
        await page.getByTestId("yjs-table-create").first().click();
        await expect(page.getByTestId("yjs-table-view").first()).toBeVisible({ timeout: 30000 });
        // The outward copy is of the rendered result, so wait for the query to
        // have produced one rather than racing it.
        await expect(page.getByTestId("yjs-table-grid").first().locator("thead th").first())
            .toBeVisible({ timeout: 30000 });
        const original = page.getByTestId("yjs-table-view");
        const gridId = await original.getAttribute("data-grid-id");
        expect(gridId).toBeTruthy();
        await expect(original.getByTestId("yjs-table-sql-name")).not.toHaveText("");
        const sqlName = await original.getByTestId("yjs-table-sql-name").textContent();
        const before = await readGridProjectState(page);
        const definition = () =>
            page.evaluate(
                id => (globalThis as any).__YJS_STORE__.yjsClient.getProject().ydoc.getMap("yjsGrids").get(id).toJSON(),
                gridId,
            );
        const saved = await definition();
        const sourceHostId = await original.evaluate(element =>
            element.closest(".outliner-item")?.getAttribute("data-item-id")
        );

        // Ctrl+A selects the whole page: every text item plus the Grid host.
        await page.locator(".outliner-item .item-content").first().click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("Control+a");
        await expect.poll(() =>
            page.evaluate(() =>
                Object.values((globalThis as any).editorOverlayStore.selections).some((selection: any) =>
                    !selection.isBoxSelection
                )
            )
        )
            .toBe(true);
        await page.keyboard.press("Control+c");
        // A rendered Grid contributes its result, not its display name.
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 15000 })
            .toContain("id\ttitle\tstatus\tpriority\tdue_date\trepeat_days");

        // Move the cursor to the end of the outline, dropping the selection.
        await page.locator(".outliner-item[data-item-id] .item-content").nth(3).click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("End");
        await page.keyboard.press("Control+v");

        await expect(page.getByTestId("yjs-table-view")).toHaveCount(2, { timeout: 30000 });
        const placements = page.locator(`[data-testid="yjs-table-view"][data-grid-id="${gridId}"]`);
        await expect(placements).toHaveCount(2);
        const hostIds = await placements.evaluateAll(elements =>
            elements.map(element => element.closest(".outliner-item")?.getAttribute("data-item-id"))
        );
        expect(new Set(hostIds).size).toBe(2);
        expect(hostIds).toContain(sourceHostId);
        for (const id of hostIds) {
            const view = page.locator(`.outliner-item[data-item-id="${id}"]`).getByTestId("yjs-table-view");
            await expect(view.locator("thead th[data-col]").first()).toBeVisible();
            await expect(view.getByTestId("yjs-table-sql-name")).toHaveText(sqlName!);
        }
        expect(await definition()).toEqual(saved);
        expect((await readGridProjectState(page)).tables).toEqual(before.tables);
    });
});
