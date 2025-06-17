import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @feature ALS-0002
 * @title Alias subtree editing and path link
 * @source docs/client-features.yaml
 */

test.describe("ALS-0002: Alias subtree editing", () => {
    let projectName: string;
    let pageName: string;

    test.beforeEach(async ({ page }, testInfo) => {
        const result = await TestHelpers.prepareTestEnvironment(page, testInfo);
        projectName = result.projectName;
        pageName = result.pageName;
    });

    test("alias path links to original page", async ({ page }) => {
        const ids = await page.evaluate(() => {
            const fc = window.__FLUID_STORE__.fluidClient;
            const project = fc.getProject();
            const page1 = project.items[0];
            const itemA = page1.items[0];
            itemA.updateText("A");
            const child = itemA.items.addNode("test-user");
            child.updateText("child");
            const page2 = project.addPage("Page2", "test-user");
            const alias = page2.items.addAliasNode(itemA, "test-user");
            return { aliasId: alias.id, childId: child.id, page1: page1.text };
        });

        await page.goto(`/${projectName}/Page2`);
        await TestHelpers.waitForOutlinerItems(page);
        const pathText = await page.locator(`[data-item-id="${ids.aliasId}"] .alias-path`).textContent();
        expect(pathText).toContain(ids.page1);

        await page.click(`[data-item-id="${ids.aliasId}"] .alias-path`);
        await TestHelpers.waitForOutlinerItems(page);
        await expect(page).toHaveURL(`/${projectName}/${ids.page1}`);

        await TestHelpers.updateItemText(page, ids.childId, "updated");
        await page.goto(`/${projectName}/Page2`);
        await TestHelpers.waitForOutlinerItems(page);
        const updatedText = await page.locator(`[data-item-id="${ids.aliasId}"] .item-text`).textContent();
        expect(updatedText).toBe("A");
    });
});
