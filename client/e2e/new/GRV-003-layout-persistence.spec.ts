/** @feature GRV-0002
 *  Title   : Graph view layout persistence
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

 test.describe("GRV-0002: Graph view layout persistence", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "Root node with [child] link",
            "child"
        ]);
    });

    test("layout persists after page reload", async ({ page }) => {
        // Assume graph view button shows the graph
        await page.click('[data-testid="graph-view-button"]');
        const nodeSelector = '.graph-node[data-item-id="Root node with [child] link"]';
        await page.dragAndDrop(nodeSelector, nodeSelector, {targetPosition: {x: 200, y: 200}});
        await page.reload();
        await page.click('[data-testid="graph-view-button"]');
        await expect(page.locator(nodeSelector)).toHaveCSS('transform', /translate(200px, 200px)/);
    });
 });
