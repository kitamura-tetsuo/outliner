import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Utility functions for validating cursor information and cursor selection ranges.
 */
export class CursorValidator {
    /**
     * Retrieves cursor information.
     */
    static async getCursorData(page: Page): Promise<any> {
        // First, set up the debug function
        await page.evaluate(() => {
            // Add the debug function to the global object
            window.getCursorDebugData = function() {
                // Get the EditorOverlayStore instance
                const editorOverlayStore = window.editorOverlayStore;
                if (!editorOverlayStore) {
                    console.error("EditorOverlayStore instance not found");
                    return { error: "EditorOverlayStore instance not found" };
                }

                try {
                    // Get cursor information
                    const cursors = Object.values(editorOverlayStore.cursors);
                    const selections = Object.values(editorOverlayStore.selections);
                    const activeItemId = editorOverlayStore.activeItemId;
                    const cursorVisible = editorOverlayStore.cursorVisible;

                    // Get information about cursor instances
                    const cursorInstances: Array<any> = [];

                    editorOverlayStore.cursorInstances.forEach((cursor: any, id: string) => {
                        cursorInstances.push({
                            cursorId: id,
                            itemId: cursor.itemId,
                            offset: cursor.offset,
                            isActive: cursor.isActive,
                            userId: cursor.userId,
                        });
                    });

                    return {
                        cursors,
                        selections,
                        activeItemId,
                        cursorVisible,
                        cursorInstances,
                        cursorCount: cursors.length,
                        selectionCount: selections.length,
                    };
                } catch (error) {
                    console.error("Error getting cursor data:", error);
                    return { error: error.message || "Unknown error" };
                }
            };
        });

        // Retrieve cursor information
        return page.evaluate(() => {
            return window.getCursorDebugData!();
        });
    }

    /**
     * Retrieves cursor information and compares it with expected values.
     * @param page The Playwright Page object.
     * @param expectedData The expected data structure (partial structure is allowed).
     * @param strict Whether to perform a strict comparison (default is false).
     * @returns The validation result.
     */
    static async assertCursorData(page: Page, expectedData: any, strict: boolean = false): Promise<void> {
        const cursorData = await this.getCursorData(page);

        if (strict) {
            // Strict comparison mode - must match exactly
            expect(JSON.stringify(cursorData)).toBe(JSON.stringify(expectedData));
        } else {
            // Partial comparison mode - OK if all properties of the expected value are included
            this.assertObjectContains(cursorData, expectedData);
        }
    }

    /**
     * Validates that an object contains all properties of the expected value.
     * @param actual The actual value.
     * @param expected The expected value.
     */
    private static assertObjectContains(actual: any, expected: any): void {
        if (typeof expected !== "object" || expected === null) {
            expect(actual).toEqual(expected);
            return;
        }

        if (Array.isArray(expected)) {
            expect(Array.isArray(actual)).toBe(true);
            expect(actual.length).toBeGreaterThanOrEqual(expected.length);

            for (let i = 0; i < expected.length; i++) {
                if (i < actual.length) {
                    this.assertObjectContains(actual[i], expected[i]);
                } else {
                    throw new Error(`Expected array item at index ${i} not found in actual array`);
                }
            }
        } else {
            for (const key in expected) {
                expect(actual).toHaveProperty(key);
                this.assertObjectContains(actual[key], expected[key]);
            }
        }
    }

    /**
     * Retrieves and validates data at a specific path of the cursor.
     * @param page The Playwright Page object.
     * @param path The path to the data (e.g., "cursors.0.offset").
     * @param expectedValue The expected value.
     */
    static async assertCursorPath(page: Page, path: string, expectedValue: any): Promise<void> {
        const cursorData = await this.getCursorData(page);
        const actualValue = this.getValueByPath(cursorData, path);
        expect(actualValue).toEqual(expectedValue);
    }

    /**
     * Retrieves the value of a specified path from an object.
     * @param obj The target object.
     * @param path The path (e.g., "cursors.0.offset").
     * @returns The value corresponding to the path.
     */
    private static getValueByPath(obj: any, path: string): any {
        return path.split(".").reduce((prev, curr) => {
            return prev && prev[curr];
        }, obj);
    }

    /**
     * Takes a snapshot of the current cursor information.
     * @param page The Playwright Page object.
     * @returns A snapshot of the cursor information.
     */
    static async takeCursorSnapshot(page: Page): Promise<any> {
        const cursorData = await this.getCursorData(page);
        return JSON.parse(JSON.stringify(cursorData));
    }

    /**
     * Compares current cursor information with a previous snapshot.
     * @param page The Playwright Page object.
     * @param snapshot The previous snapshot.
     * @param ignorePaths An array of paths to ignore (e.g., ["cursors.0.lastChanged"]).
     */
    static async compareWithSnapshot(page: Page, snapshot: any, ignorePaths: string[] = []): Promise<void> {
        const currentData = await this.getCursorData(page);
        const filteredSnapshot = this.removeIgnoredPaths(JSON.parse(JSON.stringify(snapshot)), ignorePaths);
        const filteredCurrent = this.removeIgnoredPaths(JSON.parse(JSON.stringify(currentData)), ignorePaths);

        expect(JSON.stringify(filteredCurrent)).toBe(JSON.stringify(filteredSnapshot));
    }

    /**
     * Removes properties at specified paths from an object.
     */
    private static removeIgnoredPaths(obj: any, paths: string[]): any {
        for (const path of paths) {
            const parts = path.split(".");
            const lastPart = parts.pop()!;
            const parent = parts.reduce((prev, curr) => {
                return prev && prev[curr];
            }, obj);

            if (parent && parent[lastPart] !== undefined) {
                delete parent[lastPart];
            }
        }
        return obj;
    }

    /**
     * Validates the number of cursors.
     * @param page The Playwright Page object.
     * @param expectedCount The expected number of cursors.
     */
    static async assertCursorCount(page: Page, expectedCount: number): Promise<void> {
        const cursorData = await this.getCursorData(page);
        expect(cursorData.cursors.length).toBe(expectedCount);
    }

    /**
     * Validates the item ID of the active cursor.
     * @param page The Playwright Page object.
     * @param expectedItemId The expected item ID.
     */
    static async assertActiveItemId(page: Page, expectedItemId: string): Promise<void> {
        const cursorData = await this.getCursorData(page);
        expect(cursorData.activeItemId).toBe(expectedItemId);
    }

    /**
     * Retrieves detailed information about cursor elements in the DOM.
     * @param page The Playwright Page object.
     * @returns Detailed information about cursor elements.
     */
    static async getDOMCursorInfo(page: Page): Promise<{
        totalCursors: number;
        activeCursors: number;
        cursorDetails: Array<{
            index: number;
            isActive: boolean;
            position: { left: string; top: string; };
            dataOffset: string | null;
        }>;
    }> {
        return await page.evaluate(() => {
            const cursors = Array.from(document.querySelectorAll(".cursor"));
            const activeCursors = Array.from(document.querySelectorAll(".cursor.active"));

            return {
                totalCursors: cursors.length,
                activeCursors: activeCursors.length,
                cursorDetails: cursors.map((cursor, index) => ({
                    index,
                    isActive: cursor.classList.contains("active"),
                    position: {
                        left: (cursor as HTMLElement).style.left,
                        top: (cursor as HTMLElement).style.top,
                    },
                    dataOffset: cursor.getAttribute("data-offset"),
                })),
            };
        });
    }

    /**
     * Validates cursor duplication issues (for CLM-0101).
     * @param page The Playwright Page object.
     * @param expectedCount The expected number of cursors.
     * @param stepDescription Description of the step.
     */
    static async validateCursorState(page: Page, expectedCount: number, stepDescription: string): Promise<void> {
        const domInfo = await this.getDOMCursorInfo(page);

        console.log(`${stepDescription}:`);
        console.log(`  Total cursors: ${domInfo.totalCursors}`);
        console.log(`  Active cursors: ${domInfo.activeCursors}`);
        console.log(`  Cursor details:`, domInfo.cursorDetails);

        // Verify that the cursor count matches the expectation
        expect(domInfo.totalCursors).toBe(expectedCount);
        expect(domInfo.activeCursors).toBeLessThanOrEqual(1); // At most one active cursor
    }

    /**
     * Validates the number of active cursors.
     * @param page The Playwright Page object.
     * @param expectedCount The expected number of active cursors.
     */
    static async assertActiveCursorCount(page: Page, expectedCount: number): Promise<void> {
        const domInfo = await this.getDOMCursorInfo(page);
        expect(domInfo.activeCursors).toBe(expectedCount);
    }

    /**
     * Validates that at most one cursor exists.
     * @param page The Playwright Page object.
     */
    static async assertSingleCursor(page: Page): Promise<void> {
        const domInfo = await this.getDOMCursorInfo(page);
        expect(domInfo.totalCursors).toBeLessThanOrEqual(1);
        expect(domInfo.activeCursors).toBeLessThanOrEqual(1);
    }

    /**
     * Validates cursor blinking.
     * @param page The Playwright Page object.
     * @param waitTime Time to wait for blinking state change (in milliseconds).
     */
    static async assertCursorBlink(page: Page, waitTime: number = 600): Promise<void> {
        // Verify that an active cursor exists
        const initialDomInfo = await this.getDOMCursorInfo(page);
        expect(initialDomInfo.activeCursors).toBeGreaterThan(0);

        // Get initial opacity
        const initialOpacity = await page.evaluate(() => {
            const cursor = document.querySelector(".editor-overlay .cursor.active");
            return cursor ? window.getComputedStyle(cursor).opacity : null;
        });
        expect(initialOpacity).not.toBeNull();

        // Wait for blinking state change
        await page.waitForTimeout(waitTime);

        // Get opacity after change
        const nextOpacity = await page.evaluate(() => {
            const cursor = document.querySelector(".editor-overlay .cursor.active");
            return cursor ? window.getComputedStyle(cursor).opacity : null;
        });
        expect(nextOpacity).not.toBeNull();

        // Verify that opacity has changed (is blinking)
        expect(initialOpacity).not.toBe(nextOpacity);
    }
}

// Extend global type definition (add functionality to window object for testing)
declare global {
    interface Window {
        getCursorDebugData?: () => any;
        getCursorPathData?: (path?: string) => any;
    }
}
