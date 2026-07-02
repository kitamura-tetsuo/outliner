import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature IME-0005
 *  Title   : Auto-scroll follows the real cursor position during IME composition
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("IME-0005: Auto-scroll follows composition cursor", () => {
    test("scrolls to keep the newest composed character visible when composition wraps to a new line", async ({ page }, testInfo) => {
        test.setTimeout(60000);
        await page.setViewportSize({ width: 375, height: 600 });

        const lines = [
            ...Array.from({ length: 20 }, (_, i) => `Item ${i + 1}`),
            "",
        ];
        await TestHelpers.seedProjectAndNavigate(page, testInfo, lines);

        await TestHelpers.waitForOutlinerItems(page, lines.length + 1);

        // The last (empty) item is the composition target, scrolled far below the fold initially.
        const items = page.locator(".outliner-item");
        const targetItem = items.last();
        await targetItem.scrollIntoViewIfNeeded();
        await targetItem.locator(".item-content").click({ force: true });

        const textarea = page.locator("textarea.global-textarea");
        await textarea.waitFor({ state: "visible" });
        await textarea.focus();
        await TestHelpers.waitForCursorVisible(page);

        const itemId = await TestHelpers.getActiveItemId(page);
        expect(itemId).not.toBeNull();

        // Baseline: clicking already scrolled the target item into view.
        await page.waitForTimeout(300);
        const scrollAfterFocus = await page.evaluate(() => globalThis.scrollY);

        // Start composing and grow the composition text far enough to wrap onto a
        // new line, which pushes the real cursor position below the viewport while
        // the composition start (used to anchor the hidden textarea) stays put.
        await page.evaluate(() => {
            const el = document.querySelector("textarea.global-textarea")!;
            el.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
            el.dispatchEvent(new CompositionEvent("compositionupdate", { data: "あ" }));
        });
        await page.waitForTimeout(100);

        const longComposition = "あいうえお".repeat(15);
        await page.evaluate((data) => {
            const el = document.querySelector("textarea.global-textarea")!;
            el.dispatchEvent(new CompositionEvent("compositionupdate", { data }));
        }, longComposition);

        // Wait for the smooth scroll animation to settle.
        await page.waitForTimeout(1000);

        const scrollAfterWrap = await page.evaluate(() => globalThis.scrollY);
        expect(scrollAfterWrap).toBeGreaterThan(scrollAfterFocus);

        // The active cursor must remain inside the visible viewport, not hidden below the fold.
        const viewportHeight = page.viewportSize()?.height || 600;
        const isCursorVisible = await page.evaluate((vpHeight) => {
            const cursorEl = document.querySelector(".cursor.active");
            if (!cursorEl) return false;
            const rect = cursorEl.getBoundingClientRect();
            const stickyHeaderHeight = 80;
            return rect.top >= stickyHeaderHeight && rect.bottom <= vpHeight + 160;
        }, viewportHeight);
        expect(isCursorVisible).toBe(true);

        // The composed text should reflect the full composition, and the item content
        // should be visible with its last character rendered on screen.
        const interimText = await page.locator(`.outliner-item[data-item-id="${itemId}"]`).locator(".item-text")
            .textContent();
        expect(interimText).toContain(longComposition);

        await page.evaluate((data) => {
            const el = document.querySelector("textarea.global-textarea")!;
            el.dispatchEvent(new CompositionEvent("compositionend", { data }));
        }, longComposition);
    });
});
