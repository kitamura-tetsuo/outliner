import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @feature ALS-0001
 * @title Alias items link by ID
 * @source docs/client-features.yaml
 */

test.describe("ALS-0001: Alias items link by ID", () => {
    let projectName: string;
    let pageName: string;

    test.beforeEach(async ({ page }, testInfo) => {
        const result = await TestHelpers.prepareTestEnvironment(page, testInfo);
        projectName = result.projectName;
        pageName = result.pageName;
    });

    test("alias tracks target after move and text update", async ({ page }) => {
        const ids = await page.evaluate(() => {
            const fluidClient = window.__FLUID_STORE__.fluidClient;
            const project = fluidClient.getProject();
            const page1 = project.items[0];
            const itemA = page1.items[0];
            itemA.updateText("original");
            const page2 = project.addPage("Page2", "test-user");
            const alias = page2.items.addAliasNode(itemA, "test-user");
            const index = page1.items.indexOf(itemA);
            page1.items.removeAt(index);
            page2.items.insertAtEnd(itemA);
            return { aliasId: alias.id, originalId: itemA.id };
        });

        await page.goto(`/${projectName}/Page2`);
        await TestHelpers.waitForOutlinerItems(page);

        const aliasText = await page
            .locator(`[data-item-id="${ids.aliasId}"] .item-text`)
            .textContent();
        expect(aliasText).toBe("original");

        await page.evaluate(({ originalId }) => {
            const project = window.__FLUID_STORE__.fluidClient.getProject();
            function find(items: any, id: string): any {
                for (const item of items) {
                    if (item.id === id) return item;
                    if (item.items) {
                        const found = find(item.items, id);
                        if (found) return found;
                    }
                }
                return null;
            }
            const item = find(project.items, originalId);
            item?.updateText("updated");
        }, { originalId: ids.originalId });

        await page.waitForTimeout(500);
        const updatedAliasText = await page
            .locator(`[data-item-id="${ids.aliasId}"] .item-text`)
            .textContent();
        expect(updatedAliasText).toBe("updated");
    });
});
