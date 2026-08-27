import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature GRD-5116a0dd
 *  Title   : Grid destination Page and sidebar placement drag
 *  Source  : docs/client-features/grd-grid-page-placement-5116a0dd.yaml
 *
 *  Regression coverage for #5123: the Sidebar Page drop target keeps its own
 *  transient highlight (`dragTargetPageId`) with no `dragend` handler at all,
 *  local or global — the shared drag-session safety net is what guarantees
 *  it clears once the gesture ends.
 */
import { type Page } from "@playwright/test";
import { expect, test } from "../fixtures/grid-render-trace";
import { TestHelpers } from "../utils/testHelpers";

/**
 * Creates a fresh blank Grid through the real UI flow ("Add Database" inserts a
 * new sibling item — it does not convert "Block host" itself) and returns the
 * new Grid item's own id.
 */
async function seedGridHost(page: Page): Promise<string> {
    const hostItem = page.locator(".outliner-item[data-item-id]").filter({ hasText: "Block host" }).first();
    await expect(hostItem).toBeVisible();

    await hostItem.locator(".item-content").click();
    await page.getByTestId("main-toolbar").locator(".add-database-btn").last().click();
    await page.getByTestId("yjs-table-preset-select").first().selectOption("blank");
    await page.getByTestId("yjs-table-create").first().click();
    const gridView = page.getByTestId("yjs-table-view").first();
    await expect(gridView).toBeVisible({ timeout: 30000 });

    const gridItemId = await gridView.evaluate((node) => node.closest("[data-item-id]")?.getAttribute("data-item-id"));
    expect(gridItemId).toBeTruthy();
    return gridItemId!;
}

async function addSecondPage(page: Page): Promise<string> {
    return page.evaluate(() => (globalThis as any).generalStore.project.addPage("Second page", "tester").id);
}

test.describe("GRD-5116a0dd: the Sidebar Page drop highlight is cleared on every terminal path", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Block host"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

        // The sidebar starts closed; its Page rows are `visibility: hidden` until opened.
        const sidebar = page.locator("aside.sidebar").first();
        await page.locator("button.sidebar-toggle").click();
        await expect(sidebar).toHaveClass(/open/, { timeout: 10000 });
    });

    test("a successful move-drop clears the highlight without a following dragend", async ({ page }) => {
        const hostId = await seedGridHost(page);
        const otherPageId = await addSecondPage(page);
        const otherPageRow = page.locator(`.page-item[data-page-id="${otherPageId}"]`);
        await expect(otherPageRow).toBeVisible({ timeout: 10000 });

        await page.evaluate(({ hostId, otherPageId }) => {
            const handle = document.querySelector<HTMLElement>(`[data-item-id="${hostId}"] .drag-handle`)!;
            const target = document.querySelector<HTMLElement>(`.page-item[data-page-id="${otherPageId}"]`)!;
            const dataTransfer = new DataTransfer();
            const rect = target.getBoundingClientRect();
            const point = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
            handle.dispatchEvent(
                new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer, ...point }),
            );
            target.dispatchEvent(
                new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer, ...point }),
            );
            target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer, ...point }));
            // Deliberately no dragend: the moved item can disappear from this
            // page's own rendered outline before the browser gets to it.
        }, { hostId, otherPageId });

        await expect(page.locator(".page-item.grid-drop-target")).toHaveCount(0);
        // The move genuinely happened: the Grid placement left the current page.
        await expect(page.getByTestId("yjs-table-view")).toHaveCount(0, { timeout: 10000 });
    });

    test("a cancelled drag (dragend without drop) leaves no stale highlight", async ({ page }) => {
        const hostId = await seedGridHost(page);
        const otherPageId = await addSecondPage(page);
        const otherPageRow = page.locator(`.page-item[data-page-id="${otherPageId}"]`);
        await expect(otherPageRow).toBeVisible({ timeout: 10000 });

        await page.evaluate(({ hostId, otherPageId }) => {
            const handle = document.querySelector<HTMLElement>(`[data-item-id="${hostId}"] .drag-handle`)!;
            const target = document.querySelector<HTMLElement>(`.page-item[data-page-id="${otherPageId}"]`)!;
            const dataTransfer = new DataTransfer();
            const rect = target.getBoundingClientRect();
            const point = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
            handle.dispatchEvent(
                new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer, ...point }),
            );
            target.dispatchEvent(
                new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer, ...point }),
            );
        }, { hostId, otherPageId });
        // Sanity: the highlight does appear while the gesture is active.
        await expect(otherPageRow).toHaveClass(/grid-drop-target/);

        await page.evaluate((hostId) => {
            const handle = document.querySelector<HTMLElement>(`[data-item-id="${hostId}"] .drag-handle`)!;
            handle.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true }));
        }, hostId);

        await expect(page.locator(".page-item.grid-drop-target")).toHaveCount(0);
        // Nothing moved.
        await expect(page.getByTestId("yjs-table-view")).toHaveCount(1);
    });
});
