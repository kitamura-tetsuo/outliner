/**
 * TreeValidator Usage Examples
 *
 * This file contains examples of how to use the TreeValidator class.
 * It demonstrates how to verify SharedTree data in tests.
 */

import { Page } from "@playwright/test";
import { TreeValidator } from "./treeValidation";

/**
 * Basic usage example
 * @param page Playwright page object
 */
export async function basicUsageExample(page: Page): Promise<void> {
    // Get SharedTree data structure
    const treeData = await TreeValidator.getTreeData(page);
    console.log("Tree data:", JSON.stringify(treeData, null, 2));
}

/**
 * Verification example in partial comparison mode
 * @param page Playwright page object
 */
export async function partialComparisonExample(page: Page): Promise<void> {
    // Define expected values matching the actual data structure
    const expectedData = {
        itemCount: 1,
        items: [
            {
                text: "First item",
                items: [
                    { text: "Second item" },
                    { text: "Third item" },
                ],
            },
        ],
    };

    // Verify in partial comparison mode
    await TreeValidator.assertTreeData(page, expectedData);
}

/**
 * Verification example in strict comparison mode
 * @param page Playwright page object
 */
export async function strictComparisonExample(page: Page): Promise<void> {
    // Get current data
    const currentData = await TreeValidator.getTreeData(page);

    // Strict comparison with the same data
    await TreeValidator.assertTreeData(page, currentData, true);
}

/**
 * Example of verifying data at a specific path
 * @param page Playwright page object
 */
export async function pathValidationExample(page: Page): Promise<void> {
    // Verify data at specific paths
    await TreeValidator.assertTreePath(page, "itemCount", 1);
    await TreeValidator.assertTreePath(page, "items.0.text", "First item");
    await TreeValidator.assertTreePath(page, "items.0.items.0.text", "Second item");
    await TreeValidator.assertTreePath(page, "items.0.items.1.text", "Third item");

    // Verify non-existent path (Yjs debug function)
    const nonExistentPath = await page.evaluate(() => {
        if (typeof window.getYjsTreePathData === "function") {
            return window.getYjsTreePathData("items.0.nonexistent");
        }
        return undefined;
    });

    // Confirm that undefined is returned
    if (nonExistentPath !== undefined) {
        throw new Error("Non-existent path did not return undefined");
    }
}

/**
 * Example of taking a snapshot and comparing it
 * @param page Playwright page object
 */
export async function snapshotComparisonExample(page: Page): Promise<void> {
    // Take a snapshot
    const snapshot = await TreeValidator.takeTreeSnapshot(page);

    // Compare without changes (should match)
    await TreeValidator.compareWithSnapshot(page, snapshot);

    // Add a new item
    await page.locator(".outliner-item").first().click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("New item");
    await page.waitForTimeout(500);

    // Should not match after changes
    try {
        await TreeValidator.compareWithSnapshot(page, snapshot);
        throw new Error("Snapshot unexpectedly matched");
    } catch (_error) {
        console.log("Confirmed that snapshot does not match");
        void _error;
    }
}

/**
 * Example of comparing while ignoring specific paths
 * @param page Playwright page object
 */
export async function ignorePathsExample(page: Page): Promise<void> {
    // Take a snapshot
    const snapshot = await TreeValidator.takeTreeSnapshot(page);

    // Add a new item
    await page.locator(".outliner-item").first().click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("New item");
    await page.waitForTimeout(500);

    // Compare while ignoring specific paths
    try {
        // Ignore the path of the newly added item
        await TreeValidator.compareWithSnapshot(page, snapshot, ["items.0.items.2"]);
        console.log("Matched except for ignored paths");
    } catch (_error) {
        console.error("Changed even outside of ignored paths");
        void _error;
    }
}

/**
 * Comprehensive example combining multiple tests
 * @param page Playwright page object
 */
export async function comprehensiveExample(page: Page): Promise<void> {
    // 1. Get data structure
    await TreeValidator.getTreeData(page);

    // 2. Verify basic structure with partial comparison
    const expectedStructure = {
        itemCount: 1,
        items: [
            {
                text: "First item",
                items: [
                    { text: "Second item" },
                    { text: "Third item" },
                ],
            },
        ],
    };
    await TreeValidator.assertTreeData(page, expectedStructure);

    // 3. Verify specific path
    await TreeValidator.assertTreePath(page, "items.0.text", "First item");

    // 4. Take snapshot
    await TreeValidator.takeTreeSnapshot(page);

    // 5. Make changes
    await page.locator(".outliner-item").first().click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("New item");
    await page.waitForTimeout(500);

    // 6. Get updated data
    const updatedData = await TreeValidator.getTreeData(page);

    // 7. Verify changes
    const hasNewItem = updatedData.items[0].items.some(
        (item: any) => item.text === "New item",
    );

    if (!hasNewItem) {
        throw new Error("New item was not added");
    }

    console.log("Comprehensive test complete: All verifications successful");
}
