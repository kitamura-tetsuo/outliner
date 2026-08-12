/** @feature CLP-4584c0de */
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("component block clipboard", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Block host", "Neighbor", "Paste below"]);
    });

    test("copy and paste creates a second live view of the same Grid", async ({ page }) => {
        const host = page.locator(".outliner-item").nth(1);
        await expect(host).toBeVisible();
        await host.click();
        const addDatabase = page.getByTestId("main-toolbar").locator(".add-database-btn").last();
        await addDatabase.click();
        await page.getByTestId("yjs-table-preset-select").first().selectOption("tasks");
        await page.getByTestId("yjs-table-create").first().click();
        const firstView = page.getByTestId("yjs-table-view").first();
        await expect(firstView).toBeVisible({ timeout: 30000 });
        await firstView.getByTestId("yjs-table-add-row").click();

        const items = page.locator(".outliner-item[data-item-id]");
        const renderedHost = firstView.locator(
            "xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' outliner-item ') and @data-item-id][1]",
        );
        const hostId = await renderedHost.getAttribute("data-item-id");
        const itemIds = await items.evaluateAll(elements =>
            elements.map(element => element.getAttribute("data-item-id"))
        );
        const hostIndex = itemIds.indexOf(hostId);
        expect(hostIndex).toBeGreaterThan(0);
        const neighborId = itemIds[hostIndex - 1];
        const hostText = await renderedHost.locator(".item-text").textContent();
        expect(hostId).toBeTruthy();
        expect(neighborId).toBeTruthy();
        await page.locator("textarea.global-textarea").focus();
        await page.evaluate(({ start, end, endOffset }) => {
            // eslint-disable-next-line no-restricted-globals
            const editor = window.editorOverlayStore!;
            editor.clearSelections();
            editor.setSelection({
                startItemId: start!,
                startOffset: 0,
                endItemId: end!,
                endOffset,
                userId: "local",
            });
        }, { start: neighborId, end: hostId, endOffset: hostText?.length ?? 0 });
        await page.keyboard.press("Control+c");
        // Outside Outliner a Grid is its rendered result: the header row of the
        // visible columns, not the table's display name.
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))
            .toContain("id\ttitle\tstatus\tpriority\tdue_date\trepeat_days");
        const copiedText = await page.evaluate(() => navigator.clipboard.readText());
        expect(copiedText).not.toContain("\nTasks");

        // Use the trusted browser paste event. The portable HTML payload is
        // independently round-tripped in itemClipboard.test.ts so this E2E
        // remains focused on the operating-system clipboard path.
        const target = page.locator(".outliner-item[data-item-id]").nth(1);
        await target.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("Control+v");

        await expect(page.getByTestId("yjs-table-view")).toHaveCount(2, { timeout: 30000 });
        const sqlNames = await page.locator("[data-testid='yjs-table-sql-name']").allTextContents();
        expect(sqlNames[1]).toBe(sqlNames[0]);
        await expect(page.getByTestId("yjs-table-grid").nth(1).locator("tbody tr")).toHaveCount(1, {
            timeout: 30000,
        });
    });

    test("cut and paste moves a Calendar view without losing its binding", async ({ page }) => {
        const host = page.locator(".outliner-item").nth(1);
        await host.click({ button: "right" });
        await page.locator(".context-menu button", { hasText: "Change to Calendar" }).click();
        await page.getByTestId("calendar-name-input").fill("Release plan");
        await page.getByTestId("calendar-create").click();
        await expect(page.getByTestId("calendar-view")).toBeVisible({ timeout: 30000 });

        const items = page.locator(".outliner-item[data-item-id]");
        const start = await items.nth(1).getAttribute("data-item-id");
        const end = await items.nth(2).getAttribute("data-item-id");
        await page.locator("textarea.global-textarea").focus();
        await page.evaluate(({ start, end }) => {
            // eslint-disable-next-line no-restricted-globals
            window.editorOverlayStore!.setSelection({
                startItemId: start!,
                startOffset: 0,
                endItemId: end!,
                endOffset: 8,
                userId: "local",
            });
        }, { start, end });
        await page.keyboard.press("Control+x");
        await expect(page.getByTestId("calendar-view")).toHaveCount(0, { timeout: 10000 });
        await page.locator(".outliner-item").last().click();
        await page.keyboard.press("Control+v");

        await expect(page.getByTestId("calendar-view")).toHaveCount(1, { timeout: 30000 });
        await expect(page.getByTestId("calendar-name")).toHaveText("Release plan");
    });
});
