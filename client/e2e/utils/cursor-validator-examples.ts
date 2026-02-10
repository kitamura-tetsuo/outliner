/**
 * CursorValidator usage examples
 *
 * This file contains usage examples for the CursorValidator class.
 * It demonstrates how to verify cursor information in tests.
 */

import { expect, Page } from "@playwright/test";
import { setupCursorDebugger, waitForCursorVisible } from "../helpers";
import { CursorValidator } from "./cursorValidation";

/**
 * Basic usage example
 * @param page Playwright page object
 */
export async function basicUsageExample(page: Page): Promise<void> {
    // Setup debug function for cursor information retrieval
    await setupCursorDebugger(page);

    // Click the first item to show the cursor
    await page.locator(".outliner-item").first().click();
    await waitForCursorVisible(page);

    // Get cursor information
    const cursorData = await CursorValidator.getCursorData(page);
    console.log("Cursor data:", JSON.stringify(cursorData, null, 2));
}

/**
 * Example of verification in partial comparison mode
 * @param page Playwright page object
 */
export async function partialComparisonExample(page: Page): Promise<void> {
    // Setup debug function for cursor information retrieval
    await setupCursorDebugger(page);

    // Click the first item to show the cursor
    await page.locator(".outliner-item").first().click();
    await waitForCursorVisible(page);

    // Define expected values matching the actual data structure
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
}

/**
 * Example of verification in strict comparison mode
 * @param page Playwright page object
 */
export async function strictComparisonExample(page: Page): Promise<void> {
    // Setup debug function for cursor information retrieval
    await setupCursorDebugger(page);

    // Click the first item to show the cursor
    await page.locator(".outliner-item").first().click();
    await waitForCursorVisible(page);

    // Get current data
    const currentData = await CursorValidator.getCursorData(page);

    // Verify strictly with the same data
    await CursorValidator.assertCursorData(page, currentData, true);
}

/**
 * Example of verifying data at a specific path
 * @param page Playwright page object
 */
export async function pathValidationExample(page: Page): Promise<void> {
    // Setup debug function for cursor information retrieval
    await setupCursorDebugger(page);

    // Click the first item to show the cursor
    await page.locator(".outliner-item").first().click();
    await waitForCursorVisible(page);

    // Verify the number of cursors
    await CursorValidator.assertCursorPath(page, "cursorCount", 1);

    // Verify that the first cursor is active
    await CursorValidator.assertCursorPath(page, "cursors.0.isActive", true);
}

/**
 * Example of taking a snapshot and comparing it
 * @param page Playwright page object
 */
export async function snapshotComparisonExample(page: Page): Promise<void> {
    // Setup debug function for cursor information retrieval
    await setupCursorDebugger(page);

    // Click the first item to show the cursor
    await page.locator(".outliner-item").first().click();
    await waitForCursorVisible(page);

    // Take a snapshot
    const snapshot = await CursorValidator.takeCursorSnapshot(page);

    // Compare without changes (should match)
    await CursorValidator.compareWithSnapshot(page, snapshot);

    // Move the cursor
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(100);

    // Should not match after change
    try {
        await CursorValidator.compareWithSnapshot(page, snapshot);
        throw new Error("Snapshot unexpectedly matched");
    } catch (_error /* eslint-disable-line @typescript-eslint/no-unused-vars */) {
        console.log("Confirmed that snapshot does not match");
    }
}

/**
 * Example of cursor movement test
 * @param page Playwright page object
 */
export async function cursorMovementExample(page: Page): Promise<void> {
    // Setup debug function for cursor information retrieval
    await setupCursorDebugger(page);

    // Click the first item to show the cursor
    await page.locator(".outliner-item").first().click();
    await waitForCursorVisible(page);

    // Take initial snapshot
    const initialSnapshot = await CursorValidator.takeCursorSnapshot(page);
    console.log("Initial cursor position:", initialSnapshot.cursors[0].offset);

    // Move cursor to the right
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(100);

    // Get cursor information after move
    const afterMoveSnapshot = await CursorValidator.takeCursorSnapshot(page);
    console.log("Cursor position after move:", afterMoveSnapshot.cursors[0].offset);

    // Verify that the cursor has moved
    expect(afterMoveSnapshot.cursors[0].offset).toBeGreaterThan(initialSnapshot.cursors[0].offset);
}
