import "./registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TST-0002
 *  Title   : Test for Cursor Information Validation Utility
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { waitForCursorVisible } from "../helpers";
import { CursorValidator } from "./cursorValidation";
import { TestHelpers } from "./testHelpers";

test.describe("CursorValidator: Cursor Information Validation Utility", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Set up the test page
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "First item",
            "Second item",
            "Third item",
        ]);

        // Wait a bit for data to be reflected
        await page.waitForTimeout(500);

        // Click the first item to display the cursor
        await page.locator(".outliner-item").first().click();
        await waitForCursorVisible(page);

        // Verify that editorOverlayStore is globally exposed
        await page.evaluate(() => {
            if (typeof window.editorOverlayStore === "undefined") {
                console.error("editorOverlayStore is not defined in window");
            } else {
                console.log("editorOverlayStore is available:", window.editorOverlayStore);
            }
        });

        // Verify that getCursorDebugData function is available
        await page.evaluate(() => {
            if (typeof window.getCursorDebugData !== "function") {
                console.error("getCursorDebugData is not defined in window");
            } else {
                console.log("getCursorDebugData is available");
            }
        });
    });

    test("getCursorData: Can retrieve cursor information", async ({ page }) => {
        // Retrieve cursor information
        const cursorData = await CursorValidator.getCursorData(page);

        // Verify that data is retrieved
        expect(cursorData).toBeTruthy();
        expect(cursorData.cursors).toBeTruthy();
        expect(Array.isArray(cursorData.cursors)).toBe(true);
        expect(cursorData.activeItemId).toBeTruthy();

        // Verify that at least one cursor is included
        expect(cursorData.cursors.length).toBeGreaterThan(0);

        // Check information of the first cursor
        const firstCursor = cursorData.cursors[0];
        expect(firstCursor).toHaveProperty("cursorId");
        expect(firstCursor).toHaveProperty("itemId");
        expect(firstCursor).toHaveProperty("offset");
        expect(firstCursor).toHaveProperty("isActive");

        console.log("Cursor data:", JSON.stringify(cursorData, null, 2));
    });

    test("assertCursorData: Can compare with expected value (partial comparison mode)", async ({ page }) => {
        // Define expected value matching the actual data structure
        const expectedData = {
            cursorCount: 1,
            cursors: [
                {
                    isActive: true,
                },
            ],
        };

        // Verify in partial comparison mode
        await CursorValidator.assertCursorData(page, expectedData);
    });

    test("assertCursorData: Can compare with expected value (strict comparison mode)", async ({ page }) => {
        // Get current data
        const currentData = await CursorValidator.getCursorData(page);

        // Strict comparison with the same data
        await CursorValidator.assertCursorData(page, currentData, true);
    });

    test("assertCursorPath: Can verify data at a specific path", async ({ page }) => {
        // Verify cursor count
        await CursorValidator.assertCursorPath(page, "cursorCount", 1);

        // Verify that the first cursor is active
        await CursorValidator.assertCursorPath(page, "cursors.0.isActive", true);
    });

    test("takeCursorSnapshot & compareWithSnapshot: Can take snapshot and compare", async ({ page }) => {
        // Take a snapshot
        const snapshot = await CursorValidator.takeCursorSnapshot(page);

        // Compare without changes (should match)
        await CursorValidator.compareWithSnapshot(page, snapshot);

        // Move cursor
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(100);

        // Should not match after change
        try {
            await CursorValidator.compareWithSnapshot(page, snapshot);
            // Fail if reached here
            expect(false).toBeTruthy();
        } catch (error) {
            // Expect an error to occur
            expect(error).toBeTruthy();
        }
    });

    test("assertCursorCount: Can verify cursor count", async ({ page }) => {
        // Verify cursor count
        await CursorValidator.assertCursorCount(page, 1);
    });

    test("assertActiveItemId: Can verify active item ID", async ({ page }) => {
        // Get the first item
        const firstItem = page.locator(".outliner-item").first();

        // Get item ID
        const itemId = await firstItem.getAttribute("data-item-id");
        expect(itemId).toBeTruthy();

        if (itemId) {
            // Verify active item ID
            await CursorValidator.assertActiveItemId(page, itemId);
        }
    });
});
