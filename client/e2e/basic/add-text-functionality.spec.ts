import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TST-0005
 *  Title   : Test Environment Initialization and Preparation
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @playwright
 * @title Text Addition Functionality Test
 * @description Verifies that text can be added to new and existing items via the UI.
 */

test.describe("Text Addition Functionality Test", () => {
    const seedLines = ["Existing test item 1", "Existing test item 2", "Existing test item 3"];

    test.beforeEach(async ({ page }, testInfo) => {
        // Use HTTP-based seeding via SeedClient instead of legacy browser-based seeding
        const { projectName, pageName } = await TestHelpers.createAndSeedProject(page, testInfo, seedLines);
        // Navigate to the seeded page
        await TestHelpers.navigateToProjectPage(page, projectName, pageName, seedLines);
    });

    /**
     * @testcase Can add text to a new item via UI
     * @description Clicks the add item button to create a new item and verifies that text can be added via keyboard input.
     */
    test("Can add text to a new item via UI", async ({ page }) => {
        // Record initial item count
        const initialItems = page.locator(".outliner-item[data-item-id]");
        const initialCount = await initialItems.count();

        // Click the add item button (use button in page-toolbar)
        const addButton = page.getByTestId("page-toolbar").getByRole("button", { name: "Add Item" });
        await addButton.click();
        await page.waitForTimeout(500);

        // Confirm new item is added
        const items = page.locator(".outliner-item[data-item-id]");
        const newCount = await items.count();
        expect(newCount).toBeGreaterThan(initialCount);

        // Get the newly added item (initialCount-th item, 0-indexed)
        const newItem = items.nth(initialCount);
        await newItem.locator(".item-content").click();
        await page.waitForTimeout(500);

        // Wait for cursor to be visible
        await TestHelpers.waitForCursorVisible(page);

        // Input text
        const testText = "Text for new item";
        await page.keyboard.type(testText);
        await page.waitForTimeout(500);

        // Confirm input text is displayed
        // Get text excluding HTML tags using innerText
        const itemText = await newItem.locator(".item-text").innerText();
        expect(itemText).toContain(testText);
    });

    /**
     * @testcase Can add text to an existing item via UI
     * @description Clicks an existing item to enter edit mode and verifies that text can be added via keyboard input.
     */
    test("Can add text to an existing item via UI", async ({ page }) => {
        // Get existing items (first item other than page title)
        const items = page.locator(".outliner-item[data-item-id]");
        const itemCount = await items.count();
        expect(itemCount).toBeGreaterThan(0);

        // Click the first item to enter edit mode
        const firstItem = items.first();
        await firstItem.locator(".item-content").click();
        await page.waitForTimeout(500);

        // Wait for cursor to be visible
        await TestHelpers.waitForCursorVisible(page);

        // Clear existing text
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(300);

        // Input new text
        const testText = "New text for existing item";
        await page.keyboard.type(testText);
        await page.waitForTimeout(500);

        // Confirm input text is displayed
        // Get text excluding HTML tags using innerText
        const itemText = await firstItem.locator(".item-text").innerText();
        expect(itemText).toContain(testText);
    });
});
