import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature IME-0001
 *  Title   : Japanese Input using IME
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("IME-0001: Japanese Input using IME", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Intermediate text is displayed at cursor position", async ({ page }) => {
        // Wait for items to be present first
        await TestHelpers.waitForOutlinerItems(page);

        // Prioritize using the page title
        const item = page.locator(".outliner-item.page-title");

        // If page title is not found, use the first visible item
        if (await item.count() === 0) {
            // Find an item identifiable by text content
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().waitFor({ state: "visible", timeout: 15000 });
            await visibleItems.first().locator(".item-content").click({ force: true, timeout: 15000 });
        } else {
            await item.waitFor({ state: "visible", timeout: 15000 });
            await item.locator(".item-content").click({ force: true });
        }

        // Verify entry into edit mode
        const textarea = page.locator("textarea.global-textarea");
        await textarea.waitFor({ state: "visible" });
        await textarea.focus();

        // Wait until cursor is visible
        await TestHelpers.waitForCursorVisible(page);

        // Get active item ID
        const itemId = await TestHelpers.getActiveItemId(page);
        expect(itemId).not.toBeNull();

        // simulate composition events for intermediate text
        await page.evaluate(() => {
            const el = document.querySelector("textarea.global-textarea")!;
            el.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
            el.dispatchEvent(new CompositionEvent("compositionupdate", { data: "にほん" }));
        });
        // Wait for display
        await page.waitForTimeout(100);

        // Verify intermediate text is displayed
        const interimText = await page.locator(`.outliner-item[data-item-id="${itemId}"]`).locator(".item-text")
            .textContent();
        expect(interimText).toContain("にほん");
    });

    test("Candidate conversion text is displayed at cursor position", async ({ page }) => {
        // Wait for items to be present first
        await TestHelpers.waitForOutlinerItems(page);

        // Prioritize using the page title
        const item = page.locator(".outliner-item.page-title");

        // If page title is not found, use the first visible item
        if (await item.count() === 0) {
            // Find an item identifiable by text content
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().waitFor({ state: "visible", timeout: 15000 });
            await visibleItems.first().locator(".item-content").click({ force: true, timeout: 15000 });
        } else {
            await item.waitFor({ state: "visible", timeout: 15000 });
            await item.locator(".item-content").click({ force: true });
        }

        // Verify entry into edit mode
        const textarea = page.locator("textarea.global-textarea");
        await textarea.waitFor({ state: "visible" });
        await textarea.focus();

        // Wait until cursor is visible
        await TestHelpers.waitForCursorVisible(page);

        // Get active item ID
        const itemId = await TestHelpers.getActiveItemId(page);
        expect(itemId).not.toBeNull();

        // simulate composition events for intermediate and candidate text
        await page.evaluate(() => {
            const el = document.querySelector("textarea.global-textarea")!;
            el.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
            el.dispatchEvent(new CompositionEvent("compositionupdate", { data: "にほん" }));
        });
        await page.waitForTimeout(50);
        await page.evaluate(() => {
            const el = document.querySelector("textarea.global-textarea")!;
            el.dispatchEvent(new CompositionEvent("compositionupdate", { data: "日本" }));
        });
        await page.waitForTimeout(100);

        // Verify candidate conversion text is displayed
        const candidateText = await page.locator(`.outliner-item[data-item-id="${itemId}"]`).locator(".item-text")
            .textContent();
        expect(candidateText).toContain("日本");
    });

    test("Japanese IME input is possible", async ({ page }) => {
        // Prioritize using the page title
        const item = page.locator(".outliner-item.page-title");

        // If page title is not found, use the first visible item
        if (await item.count() === 0) {
            // Find an item identifiable by text content
            const visibleItems = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visibleItems.first().locator(".item-content").click({ force: true });
        } else {
            await item.locator(".item-content").click({ force: true });
        }

        // Verify entry into edit mode
        const textarea = page.locator("textarea.global-textarea");
        await textarea.waitFor({ state: "visible" });
        await textarea.focus();

        // Wait until cursor is visible
        await TestHelpers.waitForCursorVisible(page);

        // Get active item ID
        const itemId = await TestHelpers.getActiveItemId(page);
        expect(itemId).not.toBeNull();

        // simulate full composition events
        await page.evaluate(() => {
            const el = document.querySelector("textarea.global-textarea")!;
            el.dispatchEvent(new CompositionEvent("compositionstart", { data: "にほん" }));
            el.dispatchEvent(new CompositionEvent("compositionupdate", { data: "にほん" }));
            el.dispatchEvent(new CompositionEvent("compositionend", { data: "日本" }));
        });
        // Wait for DOM update
        await page.waitForTimeout(100);

        // Verify confirmed text is reflected
        const finalText = await page.locator(`.outliner-item[data-item-id="${itemId}"]`).locator(".item-text")
            .textContent();
        expect(finalText).toContain("日本");
    });
});
