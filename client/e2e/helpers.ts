import type { Page } from "@playwright/test";
import { TestHelpers } from "./utils/testHelpers";

/**
 * @deprecated Use TestHelpers in ./utils/testHelpers instead.
 * This file is kept for backward compatibility and type definitions.
 */

/**
 * Wait until the specified number of outliner items are displayed
 */
export async function waitForOutlinerItems(page: Page, count: number, timeout = 10000): Promise<void> {
    await page.waitForFunction(
        (expected) => document.querySelectorAll(".outliner-item[data-item-id]").length >= expected,
        count,
        { timeout },
    );
}

/**
 * Wait for additional rendering if the number of outliner items is insufficient
 */
export async function ensureOutlinerItemCount(page: Page, count: number, timeout = 10000): Promise<void> {
    const current = await page.locator(".outliner-item[data-item-id]").count();
    if (current < count) {
        await waitForOutlinerItems(page, count, timeout);
    }
}

/**
 * Wait for the cursor to be visible
 * @param page Playwright page object
 * @param timeout Timeout in milliseconds
 */
export async function waitForCursorVisible(page: Page, timeout: number = 10000): Promise<boolean> {
    try {
        console.log("waitForCursorVisible: Starting to wait for cursor...");

        // Wait for global textarea to be focused
        await page.waitForSelector("textarea.global-textarea:focus", { timeout: timeout });
        console.log("waitForCursorVisible: Global textarea is focused");

        // Check if cursor element exists and is visible
        // Get cursor information using CursorValidator
        const cursorData = await page.evaluate(() => {
            // Get EditorOverlayStore instance
            const editorOverlayStore = (window as any).editorOverlayStore;
            if (!editorOverlayStore) {
                return { cursorCount: 0, activeCursors: 0 };
            }

            const cursors = Object.values(editorOverlayStore.cursors);
            const activeCursors = cursors.filter((c: any) => c.isActive);

            return {
                cursorCount: cursors.length,
                activeCursors: activeCursors.length,
            };
        });

        const cursorVisible = cursorData.activeCursors > 0;

        if (cursorVisible) {
            console.log("waitForCursorVisible: Cursor is visible");
            return true;
        } else {
            console.log("waitForCursorVisible: Cursor exists but not visible");
            return false;
        }
    } catch (error) {
        console.log("Error in waitForCursorVisible:", error);
        return false;
    }
}

/**
 * Inject cursor debug function into browser context
 * Reuse TestHelpers implementation, safe skip if missing
 */
export async function setupCursorDebugger(page: Page): Promise<void> {
    const helpersAny = TestHelpers as unknown as { setupCursorDebugger?: (page: Page) => Promise<void>; };
    if (typeof helpersAny.setupCursorDebugger === "function") {
        await helpersAny.setupCursorDebugger(page);
        return;
    }

    // Fallback: ensure stub functions exist to avoid runtime errors in tests
    await page.evaluate(() => {
        if (typeof window.getCursorDebugData !== "function") {
            window.getCursorDebugData = () => ({ error: "Cursor debugger unavailable" });
        }
        if (typeof window.getCursorPathData !== "function") {
            window.getCursorPathData = () => ({ error: "Cursor path debugger unavailable" });
        }
    });
}

// NOTE: In e2e, window structure on Playwright/JSDOM changes at runtime,
// so we intentionally use any casts like (window as any). This is a test-specific relaxation
// prioritizing reproducibility/stability of real browser behavior over type safety.
// We do not bring any casts into production code.

// Extend global type definitions (add functionality to window object for tests)
declare global {
    interface Window {
        mockUser?: { id: string; name: string; email?: string; };
        getYjsTreeDebugData?: () => any;
        getYjsTreePathData?: (path?: string) => any;
        getCursorDebugData?: () => any;
        getCursorPathData?: (path?: string) => any;
        _alertMessage?: string | null;
        __SVELTE_GOTO__?: any;
        generalStore?: any;
        editorOverlayStore?: any;
        ScrapboxFormatter?: any;
        __FIRESTORE_STORE__?: any;
    }
}
