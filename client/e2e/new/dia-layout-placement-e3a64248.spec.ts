import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature DIA-c60db19e
 *  Title   : Durable Mermaid Diagram objects and page transclusions
 *  Source  : docs/client-features/dia-mermaid-diagram-objects-and-transclusions-c60db19e.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/** Turn the first outline item into a Layout holding a Grid and a Calendar, as pre-existing content. */
async function seedLayoutWithGridAndCalendar(page: import("@playwright/test").Page) {
    return page.evaluate(() => {
        const items = (globalThis as any).generalStore.currentPage.items;
        const layout = items.at(0);
        layout.componentType = "layout";
        const grid = layout.items.addNode("e2e");
        grid.componentType = "yjstable";
        grid.columnSpan = 6;
        const calendar = layout.items.addNode("e2e");
        calendar.componentType = "calendar";
        calendar.columnSpan = 6;
        return { layoutId: layout.id, gridId: grid.id, calendarId: calendar.id };
    });
}

async function layoutChildKinds(page: import("@playwright/test").Page): Promise<string[]> {
    return page.evaluate(() => {
        const layout = (globalThis as any).generalStore.currentPage.items.at(0);
        return [...layout.items].map((child: { componentType: string; }) => child.componentType);
    });
}

test.describe("DIA-c60db19e: inserting a Mermaid diagram into a Layout", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Dashboard"]);
        await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });
    });

    test("adds a new Diagram as a direct Layout child, alongside existing Grid/Calendar", async ({ page }) => {
        const seed = await seedLayoutWithGridAndCalendar(page);
        const layoutBlock = page.getByTestId("layout-block");
        await expect(layoutBlock).toBeVisible({ timeout: 15000 });

        await layoutBlock.click({ button: "right" });
        await page.getByTestId("layout-add-diagram").click();

        await expect(page.locator('[data-testid="diagram-block"]')).toBeVisible({ timeout: 15000 });
        expect(await layoutChildKinds(page)).toEqual(["yjstable", "calendar", "diagram"]);

        // Pre-existing content is untouched (non-goal: no SQL/Grid/Calendar changes).
        const ids = await page.evaluate(() => {
            const layout = (globalThis as any).generalStore.currentPage.items.at(0);
            return [...layout.items].map((c: { id: string; }) => c.id);
        });
        expect(ids[0]).toBe(seed.gridId);
        expect(ids[1]).toBe(seed.calendarId);

        const span = await page.locator('[data-testid="diagram-block"]').evaluate((el) =>
            el.closest('[data-testid="layout-cell"]')?.getAttribute("data-column-span")
        );
        expect(span).toBe("12");
    });

    test("inserts an existing Diagram into a Layout via the chooser, sharing the same source", async ({ page }) => {
        await seedLayoutWithGridAndCalendar(page);
        const layoutBlock = page.getByTestId("layout-block");
        await expect(layoutBlock).toBeVisible({ timeout: 15000 });

        await layoutBlock.click({ button: "right" });
        await page.getByTestId("layout-add-diagram").click();
        await expect(page.locator('[data-testid="diagram-block"]')).toHaveCount(1, { timeout: 15000 });
        const firstDiagramId = await page.locator('[data-testid="diagram-block"]').getAttribute("data-diagram-id");

        await layoutBlock.click({ button: "right" });
        await page.getByTestId("layout-insert-diagram").click();
        const chooser = page.getByTestId("diagram-chooser");
        await expect(chooser).toBeVisible({ timeout: 10000 });
        await chooser.getByTestId("diagram-chooser-option").first().click();
        await chooser.getByTestId("diagram-chooser-confirm").click();

        await expect(page.locator('[data-testid="diagram-block"]')).toHaveCount(2, { timeout: 15000 });
        expect(await layoutChildKinds(page)).toEqual(["yjstable", "calendar", "diagram", "diagram"]);

        const diagramIds = await page.locator('[data-testid="diagram-block"]').evaluateAll((els) =>
            els.map((el) => el.getAttribute("data-diagram-id"))
        );
        expect(diagramIds.every((id) => id === firstDiagramId)).toBe(true);

        const registrySize = await page.evaluate(() => (globalThis as any).generalStore.project.diagrams.size);
        expect(registrySize).toBe(1);
    });
});
