import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Yjs client attach and DOM reflect", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("attaches Yjs project and renders seeded lines", async ({ page }) => {
        // Verify project is backed by a Y.Doc (guid present) even if connection state is unknown
        await page.waitForFunction(() => {
            const gs = (window as any).generalStore;
            const guid = gs?.project?.ydoc?.guid ?? null;
            return typeof guid === "string" && guid.length > 0;
        }, { timeout: 20000 });

        // Ensure currentPage exists in the global store, then seed default lines
        await page.evaluate(() => {
            const gs = (window as any).generalStore;
            if (!gs?.project) return;
            // Ensure currentPage
            if (!gs.currentPage) {
                try {
                    const url = new URL(location.href);
                    const parts = url.pathname.split("/").filter(Boolean);
                    const pageName = decodeURIComponent(parts[1] || "untitled");
                    const created = (gs.project as any)?.addPage?.(pageName, "tester");
                    if (created) gs.currentPage = created;
                } catch {}
            }
            const pageItem = gs?.currentPage;
            const items = pageItem?.items as any;
            if (!items) return;
            const lines = [
                "一行目: テスト",
                "二行目: Yjs 反映",
                "三行目: 並び順チェック",
            ];
            const existing = items.length ?? 0;
            for (let i = existing; i < 3; i++) {
                const it = items.addNode?.("tester");
                it?.updateText?.(lines[i]);
            }
        });
        // Debug counts to stabilize selectors across environments
        const counts = await page.evaluate(() => {
            try {
                const outliner = document.querySelector('[aria-label="アウトライナーツリー"]');
                return {
                    outlinerExists: !!outliner,
                    outlinerHTMLLen: outliner ? (outliner as HTMLElement).innerHTML.length : 0,
                    itemCount: document.querySelectorAll(".outliner-item").length,
                    itemWithData: document.querySelectorAll(".outliner-item[data-item-id]").length,
                    textCount: document.querySelectorAll(".item-text").length,
                };
            } catch {
                return { outlinerExists: false, outlinerHTMLLen: 0, itemCount: 0, itemWithData: 0, textCount: 0 };
            }
        });
        console.log("DEBUG selector counts", counts);
        // If fewer than 4 items (title + 3), seed defaults via model
        // Now wait for title + 3 items to render
        await page.waitForFunction(() => document.querySelectorAll(".outliner-item[data-item-id]").length >= 4, {
            timeout: 30000,
        });

        // Verify seeded lines exist in order under non-title items
        const texts = await page.evaluate(() =>
            Array.from(
                document.querySelectorAll(".outliner-item:not(.page-title) .item-text"),
            ).map(el => (el.textContent ?? "").trim()).filter(Boolean)
        );

        expect(texts.length).toBeGreaterThanOrEqual(3);
        expect(texts.slice(0, 3)).toEqual([
            "一行目: テスト",
            "二行目: Yjs 反映",
            "三行目: 並び順チェック",
        ]);
    });
});
