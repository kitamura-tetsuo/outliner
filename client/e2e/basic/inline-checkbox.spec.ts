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

test("should uncheck parent when new unchecked child is added", async ({ page }, testInfo) => {
    const { projectName, pageName } = await TestHelpers.seedProjectDataOnly(page, testInfo, ["[x] Parent"]);
    await TestHelpers.navigateToProjectPage(page, projectName, pageName, ["[x] Parent"]);

    const items = page.locator(".outliner-item[data-item-id]");
    await items.first().locator(".item-content").click();
    await page.waitForTimeout(500);

    await TestHelpers.waitForCursorVisible(page);

    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);

    await page.keyboard.press("Tab"); // Indent to make it a child
    await page.waitForTimeout(100);
    await page.keyboard.type("[x] Child A");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);

    // Now we have Parent -> Child A (both checked).
    // Let's add Child B (unchecked)
    await page.keyboard.type("[ ] Child B");

    await page.locator(".global-textarea").blur();
    await page.waitForTimeout(1000);

    const checkboxes = page.locator('input[type="checkbox"].inline-checkbox');
    await expect(checkboxes).toHaveCount(3);

    // Parent should be unchecked now
    await page.waitForFunction(() => {
        const cbs = document.querySelectorAll('input[type="checkbox"].inline-checkbox');
        return cbs.length >= 1 && !(cbs[0] as HTMLInputElement).checked;
    }, { timeout: 5000 });

    expect(await checkboxes.nth(0).evaluate((node: HTMLInputElement) => node.checked)).toBe(false);
});

test("should check parent when last unchecked child is deleted", async ({ page }, testInfo) => {
    const { projectName, pageName } = await TestHelpers.seedProjectDataOnly(page, testInfo, ["[ ] Parent"]);
    await TestHelpers.navigateToProjectPage(page, projectName, pageName, ["[ ] Parent"]);

    const items = page.locator(".outliner-item[data-item-id]");
    await items.first().locator(".item-content").click();
    await page.waitForTimeout(500);

    await TestHelpers.waitForCursorVisible(page);

    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);

    await page.keyboard.press("Tab"); // Indent
    await page.waitForTimeout(100);
    await page.keyboard.type("[x] Child A");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);

    await page.keyboard.type("[ ] Child B");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);

    // Now we have Parent -> [x] Child A, [ ] Child B.
    // Parent should be unchecked.
    // Let's delete Child B. Wait, cursor is on an empty line after Child B.
    await page.keyboard.press("Backspace"); // delete empty line
    await page.waitForTimeout(100);

    // Cursor should be at the end of Child B now
    for (let i = 0; i < 20; i++) await page.keyboard.press("Backspace"); // delete text and node
    await page.waitForTimeout(200);
    await page.keyboard.press("ArrowUp"); // Ensure focus moves so Svelte updates active item
    await page.waitForTimeout(100);

    await page.locator(".global-textarea").blur();
    await page.waitForTimeout(1000);

    const checkboxes = page.locator('input[type="checkbox"].inline-checkbox');
    await expect(checkboxes).toHaveCount(2);

    // Wait for parent to roll up and check
    await page.waitForFunction(() => {
        const cbs = document.querySelectorAll('input[type="checkbox"].inline-checkbox');
        return cbs.length >= 1 && (cbs[0] as HTMLInputElement).checked;
    }, { timeout: 5000 });

    expect(await checkboxes.nth(0).evaluate((node: HTMLInputElement) => node.checked)).toBe(true);
});
