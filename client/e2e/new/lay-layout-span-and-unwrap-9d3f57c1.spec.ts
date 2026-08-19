import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-9d3f57c1
 *  Title   : Layout span editing, responsive stacking, and unwrap
 *  Source  : docs/client-features/lay-visual-block-layout-container-9d3f57c1.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

async function seedLayout(
    page: import("@playwright/test").Page,
    blocks: Array<{ type: "yjstable" | "calendar"; span: number; }>,
) {
    await page.evaluate((definitions) => {
        const items = (globalThis as any).generalStore.currentPage.items;
        const layout = items.at(0);
        layout.componentType = "layout";
        for (const definition of definitions) {
            const child = layout.items.addNode("e2e");
            child.componentType = definition.type;
            child.columnSpan = definition.span;
        }
    }, blocks);
}

/** Persisted spans and child ids, read straight from the Yjs tree. */
const storedLayout = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
        const layout = (globalThis as any).generalStore.currentPage.items.at(0);
        return [...layout.items].map((child: { id: string; columnSpan?: number; }) => ({
            id: child.id,
            span: child.columnSpan,
        }));
    });

const cells = (page: import("@playwright/test").Page) => page.getByTestId("layout-cell");

test.describe("FTR-9d3f57c1: editing a Layout's spans, narrow stacking, and unwrap", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Dashboard"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    test("changes a span in whole columns without reordering the blocks", async ({ page }) => {
        await seedLayout(page, [{ type: "yjstable", span: 4 }, { type: "calendar", span: 8 }]);
        await expect(cells(page)).toHaveCount(2, { timeout: 15000 });
        const before = await storedLayout(page);

        await page.getByTestId("layout-span-increase").first().click();
        await expect(cells(page).nth(0)).toHaveAttribute("data-column-span", "5", { timeout: 10000 });

        await page.getByTestId("layout-span-decrease").first().click();
        await page.getByTestId("layout-span-decrease").first().click();
        await expect(cells(page).nth(0)).toHaveAttribute("data-column-span", "3", { timeout: 10000 });

        const after = await storedLayout(page);
        expect(after.map(entry => entry.id)).toEqual(before.map(entry => entry.id));
        expect(after.map(entry => entry.span)).toEqual([3, 8]);
    });

    test("adjusts a span from the keyboard and clamps at the ends of the track system", async ({ page }) => {
        await seedLayout(page, [{ type: "yjstable", span: 2 }]);
        await expect(cells(page)).toHaveCount(1, { timeout: 15000 });

        const resizer = page.getByTestId("layout-cell-resizer").first();
        await resizer.focus();
        // Focusing the Layout puts it in editing mode: the 12-column guides appear.
        await expect(page.getByTestId("layout-guides")).toBeVisible({ timeout: 10000 });

        await resizer.press("ArrowLeft");
        await expect(resizer).toHaveAttribute("aria-valuenow", "1", { timeout: 10000 });
        await resizer.press("ArrowLeft");
        await expect(resizer).toHaveAttribute("aria-valuenow", "1");

        await resizer.press("End");
        await expect(resizer).toHaveAttribute("aria-valuenow", "12", { timeout: 10000 });
        await resizer.press("ArrowRight");
        await expect(resizer).toHaveAttribute("aria-valuenow", "12");
        expect((await storedLayout(page)).map(entry => entry.span)).toEqual([12]);
    });

    test("stacks one block per row when narrow, without rewriting the stored spans", async ({ page }) => {
        await seedLayout(page, [{ type: "yjstable", span: 4 }, { type: "calendar", span: 8 }]);
        await expect(cells(page)).toHaveCount(2, { timeout: 15000 });
        const wide = await Promise.all([0, 1].map(index => cells(page).nth(index).boundingBox()));
        expect(wide[1]!.x).toBeGreaterThan(wide[0]!.x);

        const viewport = page.viewportSize();
        await page.setViewportSize({ width: 420, height: viewport?.height ?? 800 });

        await expect.poll(async () => {
            const boxes = await Promise.all([0, 1].map(index => cells(page).nth(index).boundingBox()));
            return boxes[1]!.y > boxes[0]!.y && Math.abs(boxes[1]!.x - boxes[0]!.x) < 2;
        }, { timeout: 10000 }).toBe(true);

        // Persisted layout is untouched by responsive rendering...
        expect((await storedLayout(page)).map(entry => entry.span)).toEqual([4, 8]);
        await expect(cells(page).nth(0)).toHaveAttribute("data-column-span", "4");

        // ...so the side-by-side arrangement returns with the width.
        await page.setViewportSize({ width: viewport?.width ?? 1280, height: viewport?.height ?? 800 });
        await expect.poll(async () => {
            const boxes = await Promise.all([0, 1].map(index => cells(page).nth(index).boundingBox()));
            return Math.abs(boxes[1]!.y - boxes[0]!.y) < 2 && boxes[1]!.x > boxes[0]!.x;
        }, { timeout: 10000 }).toBe(true);
    });

    test("unwrapping keeps the blocks in order and removes only the container", async ({ page }) => {
        await seedLayout(page, [{ type: "yjstable", span: 4 }, { type: "calendar", span: 8 }]);
        await expect(cells(page)).toHaveCount(2, { timeout: 15000 });
        const childIds = (await storedLayout(page)).map(entry => entry.id);

        const layoutItem = page.locator(".outliner-item").nth(1);
        await layoutItem.click({ button: "right", position: { x: 12, y: 6 } });
        const contextMenu = page.locator(".context-menu");
        await expect(contextMenu).toBeVisible({ timeout: 10000 });
        await contextMenu.locator("button", { hasText: "Remove layout (keep blocks)" }).click();

        // The container is gone; its blocks are ordinary outline items again,
        // in the same order, still bound to their own components.
        await expect(page.getByTestId("layout-block")).toHaveCount(0, { timeout: 10000 });
        await expect(page.locator(".outliner-item")).toHaveCount(3, { timeout: 10000 });

        const outline = await page.evaluate(() => {
            const items = (globalThis as any).generalStore.currentPage.items;
            return [...items].map((item: { id: string; componentType?: string; columnSpan?: number; }) => ({
                id: item.id,
                componentType: item.componentType,
                span: item.columnSpan,
            }));
        });
        expect(outline.map(entry => entry.id)).toEqual(childIds);
        expect(outline.map(entry => entry.componentType)).toEqual(["yjstable", "calendar"]);
        expect(outline.map(entry => entry.span)).toEqual([undefined, undefined]);
    });
});
