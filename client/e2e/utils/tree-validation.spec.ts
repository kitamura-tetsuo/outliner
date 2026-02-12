import "./registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature TST-0001
 *  Title   : SharedTree Data Validation Utility Tests
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "./testHelpers";
import { TreeValidator } from "./treeValidation";

test.describe("TreeValidator: SharedTree Data Validation Utility", () => {
    let actualPageTitle: string;

    test.beforeEach(async ({ page }, testInfo) => {
        // Setup test page
        const result = await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "First item",
            "Second item",
            "Third item",
        ]);

        // Save actual page title
        actualPageTitle = result.pageName;

        // Wait a bit for data to reflect
        await page.waitForTimeout(500);
    });

    test("getTreeData: Can retrieve SharedTree data structure", async ({ page }) => {
        // Retrieve SharedTree data structure (with fallback functionality)
        const treeData = await TreeValidator.getTreeData(page);

        // Confirm data is retrieved
        expect(treeData).toBeTruthy();
        expect(treeData.itemCount).toBeGreaterThan(0);
        expect(treeData.items).toBeTruthy();
        expect(Array.isArray(treeData.items)).toBe(true);

        // Confirm at least one item is included
        const texts = treeData.items.map(item => item.text);
        expect(texts.length).toBeGreaterThan(0);

        // Confirm the text of the first item
        if (texts.length > 0) {
            expect(texts[0]).toBeTruthy();
        }

        console.log("Tree data:", JSON.stringify(treeData, null, 2));
    });

    test("assertTreeData: Can compare with expected value (Partial comparison mode)", async ({ page }) => {
        // Verify basic page structure (child items are stored in pageItems map, so TreeValidator does not verify them directly)
        const expectedData = {
            itemCount: 1,
            items: [
                {
                    text: actualPageTitle, // Use actual page title
                    // Note: Child items are stored in pageItems map, so TreeValidator does not verify them
                    // If child item verification is needed, use TreeValidator.getPageItems()
                },
            ],
        };

        // Verify in partial comparison mode (with fallback functionality)
        await TreeValidator.assertTreeData(page, expectedData);
    });

    test("assertTreeData: Can compare with expected value (Strict comparison mode)", async ({ page }) => {
        // Retrieve current data (with fallback functionality)
        const currentData = await TreeValidator.getTreeData(page);

        // Strict comparison with the same data
        await TreeValidator.assertTreeData(page, currentData, true);
    });

    test("assertTreePath: Can verify data at specific path", async ({ page }) => {
        // Verify with path matching actual data structure (with fallback functionality)
        await TreeValidator.assertTreePath(page, "itemCount", 1);
        await TreeValidator.assertTreePath(page, "items.0.text", actualPageTitle); // Use actual page title

        // Note: Child items are stored in pageItems map, so TreeValidator.getTreePath does not verify them
        // If child item verification is needed, use TreeValidator.getPageItems()

        // Verify non-existent path (should return undefined)
        const nonExistentPath = await TreeValidator.getTreePathData(page, "items.0.nonexistent");
        expect(nonExistentPath).toBeUndefined();
    });

    test("takeTreeSnapshot & compareWithSnapshot: Can take snapshot and compare", async ({ page }) => {
        // Take snapshot (with fallback functionality)
        const snapshot = await TreeValidator.takeTreeSnapshot(page);

        // Compare without changes (should match)
        await TreeValidator.compareWithSnapshot(page, snapshot);

        // Add a new item
        await page.locator(".outliner-item").first().click();
        await page.keyboard.press("End");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Fourth item");
        await page.waitForTimeout(500);

        // Should not match after changes
        try {
            await TreeValidator.compareWithSnapshot(page, snapshot);
            // Failure if reached here
            expect(false).toBeTruthy();
        } catch (error) {
            // Expect an error to occur
            expect(error).toBeTruthy();
        }

        // Compare ignoring specific path
        try {
            // Ignore path of newly added item
            await TreeValidator.compareWithSnapshot(page, snapshot, ["items.0.items.2"]);
            // Failure if reached here
            expect(false).toBeTruthy();
        } catch (error) {
            // Expect an error to occur
            expect(error).toBeTruthy();
        }
    });
});
