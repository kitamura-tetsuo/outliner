import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-8ac92ce2
 *  Title   : Object Manager Page placement navigation
 *  Source  : docs/client-features/obj-project-object-manager-8ac92ce2.yaml
 */
import { expect, test } from "@playwright/test";
import { createBlankGrid } from "../utils/crossProjectGridHelpers";
import { TestHelpers } from "../utils/testHelpers";

async function openSidebar(page: import("@playwright/test").Page) {
    const showBtn = page.locator('button[aria-label="Show sidebar"]');
    if (await showBtn.isVisible().catch(() => false)) await showBtn.click();
    const sidebar = page.locator('aside.sidebar[aria-label="Main Sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
    return sidebar;
}

test.describe("FTR-8ac92ce2: clicking a placement navigates to and reveals the exact block", () => {
    test("navigates to the Page and scrolls the Grid block into view", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        const { projectName, pageName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Item 1"]);
        await createBlankGrid(page, "Nav Test Grid", "nav_test_grid");

        const gridBlockId = await page.evaluate(() => {
            const items = (globalThis as unknown as {
                generalStore: {
                    currentPage: {
                        items: { length: number; at: (i: number) => { id: string; componentType?: string; }; };
                    };
                };
            }).generalStore.currentPage.items;
            for (let i = 0; i < items.length; i++) {
                const item = items.at(i);
                if (item.componentType === "yjstable") return item.id;
            }
            return undefined;
        });
        expect(gridBlockId).toBeTruthy();

        const sidebar = await openSidebar(page);
        await sidebar.getByRole("link", { name: "Object Manager" }).click();
        await expect(page).toHaveURL(/\/objects$/, { timeout: 15000 });

        const gridRow = page.locator('[data-testid^="object-row-"]').filter({ hasText: "Nav Test Grid" }).filter({
            has: page.locator(".type-badge.grid"),
        });
        await expect(gridRow).toBeVisible({ timeout: 15000 });

        const placementChip = gridRow.locator(".placement-chip");
        await expect(placementChip).toHaveText(new RegExp(pageName, "i"));
        await placementChip.click();

        // Navigated back to the owning Page and scrolled the block into view.
        await expect(page).toHaveURL(
            new RegExp(`/${encodeURIComponent(projectName)}/${encodeURIComponent(pageName)}`),
            { timeout: 15000 },
        );
        const block = page.locator(`[data-visual-node-root="${gridBlockId}"]`);
        await expect(block).toBeVisible({ timeout: 15000 });
        await expect.poll(async () => {
            const box = await block.boundingBox();
            const viewport = page.viewportSize();
            if (!box || !viewport) return false;
            return box.top >= -5 && box.top <= viewport.height;
        }, { timeout: 15000 }).toBe(true);
    });
});
