import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TST-0005
 *  Title   : テスト環境の初期化と準備
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @playwright
 * @title Add Text Functionality Test
 * @description Verify that new items and existing items can be edited via the UI.
 */

test.describe("Add Text Functionality Test", () => {
    const seedLines = ["Existing Test Item 1", "Existing Test Item 2", "Existing Test Item 3"];

    test.beforeEach(async ({ page }, testInfo) => {
        // Use HTTP-based seeding via SeedClient instead of legacy browser-based seeding
        const { projectName, pageName } = await TestHelpers.createAndSeedProject(page, testInfo, seedLines);
        // Navigate to the seeded page
        await TestHelpers.navigateToProjectPage(page, projectName, pageName, seedLines);
    });

    /**
     * @testcase Can add text to new items via UI
     * @description Verify that clicking the Add Item button creates a new item and allows text input.
     */
    test("should add text to new items via UI", async ({ page }) => {
        // Record initial item count
        const initialItems = page.locator(".outliner-item[data-item-id]");
        const initialCount = await initialItems.count();

        // Click Add Item button (use button in page-toolbar)
        const addButton = page.getByTestId("page-toolbar").getByRole("button", { name: "Add Item" });
        await addButton.click();
        await page.waitForTimeout(500);

        // Verify new item added
        const items = page.locator(".outliner-item[data-item-id]");
        const newCount = await items.count();
        expect(newCount).toBeGreaterThan(initialCount);

        // Select the newly added item (initialCount-th item, 0-indexed)
        const newItem = items.nth(initialCount);
        await newItem.locator(".item-content").click();
        await page.waitForTimeout(500);

        // Wait for cursor
        await TestHelpers.waitForCursorVisible(page);

        // Type text
        const testText = "Text for new item";
        await page.keyboard.type(testText);
        await page.waitForTimeout(500);

        // Verify text visible
        const itemText = await newItem.locator(".item-text").innerText();
        expect(itemText).toContain(testText);
    });

    /**
     * @testcase Can add text to existing items via UI
     * @description Verify that clicking an existing item enters edit mode and allows text changes.
     */
    test("should add text to existing items via UI", async ({ page }) => {
        // Get existing items (first item after page title)
        const items = page.locator(".outliner-item[data-item-id]");
        const itemCount = await items.count();
        expect(itemCount).toBeGreaterThan(0);

        // Click first item to enter edit mode
        const firstItem = items.first();
        await firstItem.locator(".item-content").click();
        await page.waitForTimeout(500);

        // Wait for cursor
        await TestHelpers.waitForCursorVisible(page);

        // Clear existing text
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(300);

        // Type new text
        const testText = "New text for existing item";
        await page.keyboard.type(testText);
        await page.waitForTimeout(500);

        // Verify text visible
        const itemText = await firstItem.locator(".item-text").innerText();
        expect(itemText).toContain(testText);
    });
});
