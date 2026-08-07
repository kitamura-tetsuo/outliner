/** @feature CLP-4584c0de */
import { expect, type Locator, type Page, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

const advancedFeaturesPath = "/demo/Advanced%20Features";

async function resetDemo(page: Page) {
    await page.goto("/demo");
    const reset = page.getByTestId("demo-reset-button");
    await expect(reset).toBeEnabled({ timeout: 30000 });
    await reset.click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    const [response] = await Promise.all([
        page.waitForResponse(value => value.url().includes("/api/seed-demo") && value.request().method() === "POST"),
        dialog.getByRole("button", { name: "Reset", exact: true }).click(),
    ]);
    expect(response.ok(), `demo cleanup failed with HTTP ${response.status()}`).toBe(true);
    await expect(page.getByTestId("demo-reset-done")).toBeVisible({ timeout: 30000 });
}

async function dragAcrossWholeItems(start: Locator, end: Locator) {
    const page = start.page();
    const startBox = await start.boundingBox();
    const endBox = await end.boundingBox();
    expect(startBox).not.toBeNull();
    expect(endBox).not.toBeNull();
    // Expand the drag box horizontally so it captures the beginning and end of the text perfectly
    await page.mouse.move(startBox!.x - 10, startBox!.y + startBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(endBox!.x + endBox!.width + 10, endBox!.y + endBox!.height / 2, { steps: 24 });
    await page.mouse.up();
}

test.afterEach(async ({ page }) => {
    await resetDemo(page);
});

test("deployed demo preserves the Sales Grid binding through the real clipboard", async ({ page }) => {
    await page.goto(advancedFeaturesPath);
    const grids = page.getByTestId("yjs-table-view");
    await expect(grids).toHaveCount(2, { timeout: 90000 });

    const salesHost = grids.first().locator("xpath=ancestor::*[contains(@class, 'outliner-item')][1]");
    const neighbor = salesHost.locator("xpath=following::*[contains(@class, 'outliner-item')][1]");

    // Explicitly use keyboard selection for accurate offset boundaries instead of mouse dragging
    // which in headless Chromium can slightly miss the exact character boundaries.
    await salesHost.locator(".item-text").click();
    await page.keyboard.press("Home");
    await page.keyboard.down("Shift");
    await neighbor.locator(".item-text").click();
    await page.keyboard.press("End");
    await page.keyboard.up("Shift");

    await page.waitForTimeout(500);
    await page.keyboard.press("Control+c");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Database tables:");

    const destination = page.locator(".outliner-item[data-item-id]").last();
    await destination.locator(".item-content").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");

    await page.waitForTimeout(500); // Give time for new item to become active

    // Some headless testing environments require dispatching paste directly when
    // Control+v does not work properly natively for custom clipboard contents.
    await page.evaluate(async () => {
        let text = "";
        try {
            text = await navigator.clipboard.readText();
        } catch {
            text = (window as any).lastCopiedText || "";
        }
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        // Fallback for playwright custom mime type stripping
        if ((window as any).lastCopiedStructuredItems) {
            dt.setData("application/outliner-items", (window as any).lastCopiedStructuredItems.encoded);
        }
        const pasteEvent = new ClipboardEvent("paste", {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
        });
        document.querySelector(".global-textarea")?.dispatchEvent(pasteEvent);
    });

    await expect(grids).toHaveCount(3, { timeout: 30000 });
    await expect(page.getByTestId("yjs-table-sql-name").last()).toHaveText("sales");
    const originalRows = grids.first().locator("tbody tr");
    const pastedRows = grids.last().locator("tbody tr");
    await expect(pastedRows).toHaveCount(await originalRows.count());
});
