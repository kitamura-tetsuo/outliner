/** @feature CLP-4584c0de */
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

// A Chart is a view over the same query result as its Grid, so copying its host
// puts both on the clipboard in one write: the numbers for a spreadsheet, the
// picture for a document (docs/grid-clipboard-spec.md §8.1).
test.describe("chart clipboard flavors", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Neighbor", "Block host"]);
    });

    test("copying a Grid in chart view carries the picture and the numbers", async ({ page }) => {
        const host = page.locator(".outliner-item[data-item-id]").filter({ hasText: "Block host" }).first();
        await host.locator(".item-content").click();
        await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
        await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
        await page.getByTestId("yjs-table-create").first().click();

        const view = page.getByTestId("yjs-table-view").first();
        await expect(view).toBeVisible({ timeout: 30000 });
        await view.getByTestId("yjs-table-add-row").click();
        await expect(page.getByTestId("yjs-table-grid").first().locator("tbody tr")).toHaveCount(1, {
            timeout: 30000,
        });

        await view.getByTestId("yjs-table-toggle-chart").click();
        await expect(page.getByTestId("yjs-table-chart")).toBeVisible({ timeout: 30000 });

        const hostId = await view.locator(
            "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' outliner-item ') and @data-item-id][1]",
        ).getAttribute("data-item-id");
        const neighborId = await page.locator(".outliner-item[data-item-id]").filter({ hasText: "Neighbor" })
            .first().getAttribute("data-item-id");
        expect(hostId).toBeTruthy();
        expect(neighborId).toBeTruthy();

        await page.locator("textarea.global-textarea").focus();
        await page.evaluate(({ start, end }) => {
            // eslint-disable-next-line no-restricted-globals
            const editor = window.editorOverlayStore!;
            editor.clearSelections();
            editor.setSelection({
                startItemId: start!,
                startOffset: 0,
                endItemId: end!,
                endOffset: 0,
                userId: "local",
            });
        }, { start: neighborId, end: hostId });
        await page.keyboard.press("Control+c");

        // text/plain stays the TSV: a spreadsheet gets the cells, not a picture.
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 15000 })
            .toContain("id\ttitle\tstatus\tpriority\tdue_date\trepeat_days");

        // text/html carries the same table plus the rendered chart, and the PNG
        // is offered as its own flavor for image-only destinations.
        const readFlavors = () =>
            page.evaluate(async () => {
                try {
                    const items = await navigator.clipboard.read();
                    const item = items.find(entry => entry.types.includes("text/html"));
                    if (!item) return { html: "", types: [] as string[] };
                    return { html: await (await item.getType("text/html")).text(), types: item.types };
                } catch (_e) {
                    return { html: "", types: [] as string[] };
                }
            });
        await expect.poll(readFlavors, { timeout: 15000 }).toMatchObject({
            html: expect.stringContaining("<table>"),
        });

        const flavors = await readFlavors();
        expect(flavors.html).toContain("<th>title</th>");
        expect(flavors.html).toContain('<img src="data:image/png;base64,');
        expect(flavors.types).toContain("image/png");
    });
});
