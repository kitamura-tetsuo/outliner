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
    test(
        "scrolls to keep the newest composed character visible when composition wraps to a new line",
        async ({ page }, testInfo) => {
            test.setTimeout(90000);
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
            await targetItem.waitFor({ state: "visible" });
            const itemId = await targetItem.getAttribute("data-item-id");
            expect(itemId).not.toBeNull();

            // Activate the item directly via the store, bypassing a real click/scroll,
            // which is unreliable for an item scrolled far below the fold.
            await page.evaluate((id) => {
                const store = (globalThis as any).editorOverlayStore;
                store.setActiveItem(id);
                store.setCursor({ itemId: id, offset: 0, isActive: true, userId: "local" });
                const ta = document.querySelector("textarea.global-textarea") as HTMLTextAreaElement;
                ta?.focus();
            }, itemId);

            // Baseline: activating the cursor already scrolls the target item into view
            // via the app's normal (non-composing) scroll-into-view logic.
            await page.waitForTimeout(500);
            const scrollAfterFocus = await page.evaluate(() => globalThis.scrollY);

            // Start composing and grow the composition text incrementally (as a real IME
            // does, one clause at a time) far enough to wrap onto a new line, which pushes
            // the real cursor position below the viewport while the composition start
            // (used to anchor the hidden textarea) stays put.
            await page.evaluate(() => {
                const el = document.querySelector("textarea.global-textarea")!;
                el.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
            });

            const syllable = "あいうえお";
            let composed = "";
            for (let i = 0; i < 15; i++) {
                composed += syllable;
                await page.evaluate((data) => {
                    const el = document.querySelector("textarea.global-textarea")!;
                    el.dispatchEvent(new CompositionEvent("compositionupdate", { data }));
                }, composed);
                await page.waitForTimeout(80);
            }

            // The composed text should reflect the full composition once rendering settles.
            const itemTextLocator = page.locator(`.outliner-item[data-item-id="${itemId}"]`).locator(".item-text");
            await expect(itemTextLocator).toContainText(composed, { timeout: 10000 });

            // The active cursor must (eventually) end up inside the visible viewport, not
            // hidden below the fold. Poll instead of a single fixed wait, since the
            // scroll-into-view decision runs on a debounced store subscription and may
            // need one more tick to catch up with the latest composed text.
            const viewportHeight = page.viewportSize()?.height || 600;
            await expect.poll(
                () =>
                    page.evaluate((vpHeight) => {
                        const cursorEl = document.querySelector(".cursor.active");
                        if (!cursorEl) return false;
                        const rect = cursorEl.getBoundingClientRect();
                        const stickyHeaderHeight = 80;
                        return rect.top >= stickyHeaderHeight && rect.bottom <= vpHeight + 160;
                    }, viewportHeight),
                { timeout: 10000, message: "active cursor should scroll into view while composing" },
            ).toBe(true);

            const scrollAfterWrap = await page.evaluate(() => globalThis.scrollY);
            expect(scrollAfterWrap).toBeGreaterThan(scrollAfterFocus);

            await page.evaluate((data) => {
                const el = document.querySelector("textarea.global-textarea")!;
                el.dispatchEvent(new CompositionEvent("compositionend", { data }));
            }, composed);
        },
    );
});
