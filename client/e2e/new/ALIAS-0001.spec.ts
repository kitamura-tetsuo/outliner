/** @feature ALIAS-0001
 *  Title   : Alias References
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ALIAS-0001: Alias references display target text", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("alias reflects target text changes", async ({ page }) => {
        // create an item and alias via Fluid API
        await page.evaluate(() => {
            const fluidClient = window.__FLUID_STORE__.fluidClient;
            const project = fluidClient.getProject();
            const pageItem = project.items.getAt(0);
            const items = pageItem.items;
            const node = items.addNode("test-user");
            node.updateText("Hello");
            items.addAlias(node.id, "test-user");
        });

        // get the last item id (alias) from view model
        const aliasId = await page.evaluate(() => {
            const els = document.querySelectorAll<HTMLElement>(".outliner-item");
            const last = els[els.length - 1];
            return last.dataset.itemId as string;
        });
        const aliasText = page.locator(`.outliner-item[data-item-id="${aliasId}"] .item-text`);
        await expect(aliasText).toHaveText("Hello");

        // update original item text
        await page.evaluate(() => {
            const fluidClient = window.__FLUID_STORE__.fluidClient;
            const project = fluidClient.getProject();
            const pageItem = project.items.getAt(0);
            const first = pageItem.items.getAt(0);
            first.updateText("World");
        });
        await expect(aliasText).toHaveText("World");
    });
});
