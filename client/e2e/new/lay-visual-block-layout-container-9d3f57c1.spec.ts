import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-9d3f57c1
 *  Title   : Visual-block Layout container with 12-column span-based placement
 *  Source  : docs/client-features/lay-visual-block-layout-container-9d3f57c1.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/** Turn the first outline item into a Layout holding the given visual blocks. */
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

const cells = (page: import("@playwright/test").Page) => page.getByTestId("layout-cell");

test.describe("FTR-9d3f57c1: a Layout arranges visual blocks on a 12-column grid", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Dashboard"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    test("renders a 12-column grid and puts span 4 + span 8 on one row", async ({ page }) => {
        await seedLayout(page, [{ type: "yjstable", span: 4 }, { type: "calendar", span: 8 }]);

        const grid = page.getByTestId("layout-grid");
        await expect(grid).toBeVisible({ timeout: 15000 });
        await expect(cells(page)).toHaveCount(2, { timeout: 15000 });

        const tracks = await grid.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(" ").length);
        expect(tracks).toBe(12);

        await expect(cells(page).nth(0)).toHaveAttribute("data-column-span", "4");
        await expect(cells(page).nth(1)).toHaveAttribute("data-column-span", "8");

        const first = (await cells(page).nth(0).boundingBox())!;
        const second = (await cells(page).nth(1).boundingBox())!;
        // One row: the second block starts to the right of the first, at the
        // same top edge.
        expect(Math.abs(first.y - second.y)).toBeLessThan(2);
        expect(second.x).toBeGreaterThan(first.x);
        // 4 columns against 8: the second block is about twice as wide.
        expect(second.width / first.width).toBeGreaterThan(1.6);
        expect(second.width / first.width).toBeLessThan(2.4);
    });

    test("puts 6 + 6 on one row and wraps once the cumulative span exceeds 12", async ({ page }) => {
        await seedLayout(page, [
            { type: "yjstable", span: 6 },
            { type: "calendar", span: 6 },
            { type: "yjstable", span: 6 },
            { type: "calendar", span: 6 },
        ]);

        await expect(cells(page)).toHaveCount(4, { timeout: 15000 });
        const boxes = await Promise.all([0, 1, 2, 3].map(index => cells(page).nth(index).boundingBox()));

        expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(2);
        expect(Math.abs(boxes[2]!.y - boxes[3]!.y)).toBeLessThan(2);
        // Auto-placement wrapped: the third block starts a new row, back at the
        // first column.
        expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y);
        expect(Math.abs(boxes[2]!.x - boxes[0]!.x)).toBeLessThan(2);
        expect(Math.abs(boxes[0]!.width - boxes[1]!.width)).toBeLessThan(4);
    });

    test("renders the blocks in tree order and keeps them out of the flat outline", async ({ page }) => {
        await seedLayout(page, [{ type: "yjstable", span: 4 }, { type: "calendar", span: 8 }]);
        await expect(cells(page)).toHaveCount(2, { timeout: 15000 });

        const treeOrder = await page.evaluate(() => {
            const layout = (globalThis as any).generalStore.currentPage.items.at(0);
            return [...layout.items].map((child: { id: string; }) => child.id);
        });
        const renderedOrder = await cells(page).evaluateAll(nodes =>
            nodes.map(node => node.getAttribute("data-item-id"))
        );
        expect(renderedOrder).toEqual(treeOrder);

        // The Layout renders its children; they are not also outline rows.
        // Page title + the Layout item itself, and nothing more.
        await expect(page.locator(".outliner-item")).toHaveCount(2);
    });

    test("repairs an out-of-range persisted span instead of breaking the grid", async ({ page }) => {
        await seedLayout(page, [{ type: "yjstable", span: 4 }]);
        await expect(cells(page)).toHaveCount(1, { timeout: 15000 });

        await page.evaluate(() => {
            const layout = (globalThis as any).generalStore.currentPage.items.at(0);
            layout.items.at(0).columnSpan = 40;
        });

        await expect(cells(page).nth(0)).toHaveAttribute("data-column-span", "12", { timeout: 10000 });
    });

    test("keeps an empty Layout as a drop target when its last block is removed", async ({ page }) => {
        await seedLayout(page, [{ type: "yjstable", span: 6 }]);
        await expect(cells(page)).toHaveCount(1, { timeout: 15000 });

        await page.evaluate(() => {
            const layout = (globalThis as any).generalStore.currentPage.items.at(0);
            layout.items.at(0).delete();
        });

        await expect(cells(page)).toHaveCount(0, { timeout: 10000 });
        await expect(page.getByTestId("layout-empty")).toBeVisible({ timeout: 10000 });
        await expect(page.getByTestId("layout-block")).toBeVisible();
    });
});
