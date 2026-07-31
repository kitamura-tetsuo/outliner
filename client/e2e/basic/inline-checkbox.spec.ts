import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Inline Checkboxes", () => {
    test("should render seeded checkboxes and toggle correctly", async ({ page }, testInfo) => {
        const { projectName, pageName } = await TestHelpers.seedProjectDataOnly(page, testInfo, [
            "[ ] Parent",
            "    [ ] Milk",
            "    [x] Bread",
        ]);
        await TestHelpers.navigateToProjectPage(page, projectName, pageName, [
            "[ ] Parent",
            "    [ ] Milk",
            "    [x] Bread",
        ]);

        const checkboxes = page.locator('input[type="checkbox"].inline-checkbox');
        await expect(checkboxes).toHaveCount(3, { timeout: 5000 });

        await expect(checkboxes.nth(0)).not.toBeChecked();
        await expect(checkboxes.nth(1)).not.toBeChecked();
        await expect(checkboxes.nth(2)).toBeChecked();

        // Toggle Milk
        await checkboxes.nth(1).evaluate((node: HTMLInputElement) => node.click());

        await page.waitForFunction(() => {
            const cbs = document.querySelectorAll('input[type="checkbox"].inline-checkbox');
            return cbs.length >= 2 && (cbs[1] as HTMLInputElement).checked;
        }, { timeout: 5000 });
        await expect(checkboxes.nth(1)).toBeChecked();

        // Toggle Parent
        await checkboxes.nth(0).evaluate((node: HTMLInputElement) => node.click());

        await page.waitForFunction(() => {
            const cbs = document.querySelectorAll('input[type="checkbox"].inline-checkbox');
            return cbs.length >= 1 && (cbs[0] as HTMLInputElement).checked;
        }, { timeout: 5000 });
        await expect(checkboxes.nth(0)).toBeChecked();

        // Toggle Bread
        await checkboxes.nth(2).evaluate((node: HTMLInputElement) => node.click());

        await page.waitForFunction(() => {
            const cbs = document.querySelectorAll('input[type="checkbox"].inline-checkbox');
            return cbs.length >= 3 && !(cbs[2] as HTMLInputElement).checked;
        }, { timeout: 5000 });
        await expect(checkboxes.nth(2)).not.toBeChecked();
    });

    test("should create a clickable checkbox when typing", async ({ page }, testInfo) => {
        const { projectName, pageName } = await TestHelpers.seedProjectDataOnly(page, testInfo, ["Start"]);
        await TestHelpers.navigateToProjectPage(page, projectName, pageName, ["Start"]);

        const items = page.locator(".outliner-item[data-item-id]");
        await items.first().locator(".item-content").click();
        await page.waitForTimeout(500);
        await TestHelpers.waitForCursorVisible(page);

        // Replace Start with [ ] Typed unchecked
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(100);
        await page.keyboard.type("[ ] Typed unchecked");
        await page.keyboard.press("Enter"); // Moves cursor to next line
        await page.waitForTimeout(100);

        // Now first line is not focused, so it should render the checkbox
        const checkboxes = page.locator('input[type="checkbox"].inline-checkbox');
        await expect(checkboxes).toHaveCount(1, { timeout: 5000 });
        await expect(checkboxes.nth(0)).not.toBeChecked();

        // Type on the new line
        await page.keyboard.type("[x] Typed checked");
        await page.keyboard.press("Enter"); // Moves cursor to next line
        await page.waitForTimeout(100);

        await expect(checkboxes).toHaveCount(2, { timeout: 5000 });
        await expect(checkboxes.nth(1)).toBeChecked();
    });
});
