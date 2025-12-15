import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

// Helper function to get the bounding box of the active cursor
async function getCursorBoundingBox(page: import("playwright").Page): Promise<DOMRect | null> {
    return await page.evaluate(() => {
        const cursor = document.querySelector(".cursor.active");
        if (cursor) {
            return cursor.getBoundingClientRect();
        }
        return null;
    });
}

test.describe("Bug: Cursor Scroll Misalignment", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        const lines = Array.from({ length: 200 }, (_, i) => `Line ${i + 1}`);
        await TestHelpers.prepareTestEnvironment(page, testInfo, lines);
    });

    test("should reproduce cursor misalignment on scroll", async ({ page }) => {
        // 1. Set up is done in beforeEach. Now, get the first item's ID.
        const itemId = await TestHelpers.getItemIdByIndex(page, 0);
        expect(itemId).not.toBeNull();

        // 2. Place the cursor at a specific position (e.g., end of the first line).
        await TestHelpers.setCursor(page, itemId!, `Line 1`.length);
        await TestHelpers.waitForCursorVisible(page);

        // Get the initial cursor position.
        const initialCursorRect = await getCursorBoundingBox(page);
        expect(initialCursorRect).not.toBeNull();

        // 3. Scroll the container down.
        await page.evaluate(() => {
            const outliner = document.querySelector(".outliner-container");
            if (outliner) {
                outliner.scrollTop = 500;
            }
        });
        await page.waitForTimeout(500); // Wait for scroll to complete

        // Get the new cursor position.
        const scrolledCursorRect = await getCursorBoundingBox(page);
        expect(scrolledCursorRect).not.toBeNull();

        // 4. Assert that the cursor's visual position has NOT changed significantly.
        // This test asserts the presence of the bug. When the bug is fixed,
        // this test will fail, indicating that the fix is working and this
        // test should be updated to assert the correct behavior.
        const topDifference = Math.abs(scrolledCursorRect!.top - initialCursorRect!.top);
        expect(topDifference).toBeLessThan(1);
    });
});
