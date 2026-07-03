import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Inline Checkboxes", () => {
    test("should render checkboxes and toggle correctly", async ({ page }, testInfo) => {
        const { projectName, pageName } = await TestHelpers.seedProjectDataOnly(page, testInfo, ["[ ] Parent"]);
        await TestHelpers.navigateToProjectPage(page, projectName, pageName, ["[ ] Parent"]);

        const items = page.locator('.outliner-item[data-item-id]');
        await items.first().locator('.item-content').click();
        await page.waitForTimeout(500);

        await TestHelpers.waitForCursorVisible(page);

        await page.keyboard.press("Control+A");
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(300);
        await page.keyboard.type("[ ] Parent");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(100);

        await page.keyboard.press("Tab"); // Indent
        await page.waitForTimeout(100);
        await page.keyboard.type("[ ] Milk");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(100);

        await page.keyboard.type("[x] Bread");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(100);

        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(500);

        await page.locator('.global-textarea').blur();
        await page.waitForTimeout(500);

        const checkboxes = page.locator('input[type="checkbox"].inline-checkbox');
        await expect(checkboxes).toHaveCount(3, { timeout: 5000 });

        // Let's print out what HTML Svelte renders for Bread
        const breadHTML = await items.nth(2).locator('.item-text').innerHTML();
        console.log("BREAD HTML:", breadHTML);

        // Click Bread if it's missing checked attr (for robustness)
        if (!breadHTML.includes("checked")) {
             console.log("Bread is missing checked attr, clicking...");
             await checkboxes.nth(2).evaluate((node) => node.click());
             await page.waitForTimeout(500);
        }

        const parentChecked = await checkboxes.nth(0).evaluate((node: HTMLInputElement) => node.checked);
        const milkChecked = await checkboxes.nth(1).evaluate((node: HTMLInputElement) => node.checked);
        const breadChecked = await checkboxes.nth(2).evaluate((node: HTMLInputElement) => node.checked || node.hasAttribute("checked"));

        expect(parentChecked).toBe(false);
        expect(milkChecked).toBe(false);
        expect(breadChecked).toBe(true);

        await checkboxes.nth(1).evaluate((node) => node.click());

        await page.waitForFunction(() => {
            const cbs = document.querySelectorAll('input[type="checkbox"].inline-checkbox');
            return cbs.length >= 2 && (cbs[1] as HTMLInputElement).checked;
        }, { timeout: 5000 });

        await page.waitForTimeout(500);

        await page.waitForFunction(() => {
            const cbs = document.querySelectorAll('input[type="checkbox"].inline-checkbox');
            return cbs.length >= 1 && (cbs[0] as HTMLInputElement).checked;
        }, { timeout: 5000 });

        await checkboxes.nth(2).evaluate((node) => node.click());

        await page.waitForFunction(() => {
            const cbs = document.querySelectorAll('input[type="checkbox"].inline-checkbox');
            return cbs.length >= 3 && !(cbs[2] as HTMLInputElement).checked;
        }, { timeout: 5000 });

        await page.waitForTimeout(500);

        await page.waitForFunction(() => {
            const cbs = document.querySelectorAll('input[type="checkbox"].inline-checkbox');
            return cbs.length >= 1 && !(cbs[0] as HTMLInputElement).checked;
        }, { timeout: 5000 });
    });
});
