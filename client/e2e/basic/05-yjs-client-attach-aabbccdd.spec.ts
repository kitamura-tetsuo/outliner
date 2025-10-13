import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Yjs client attach and DOM reflect", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("attaches Yjs project and renders seeded lines", async ({ page }) => {
        // Verify project is backed by a Y.Doc (guid present) even if connection state is unknown
        await page.waitForFunction(() => {
            const gs = (window as { generalStore?: { project?: { ydoc?: { guid?: string; }; }; }; }).generalStore;
            const guid = gs?.project?.ydoc?.guid ?? null;
            return typeof guid === "string" && guid.length > 0;
        }, { timeout: 30000 });

        // Ensure currentPage exists in the global store, then seed default lines
        await page.evaluate(() => {
            const gs = (window as {
                generalStore?: { project?: Record<string, unknown>; currentPage?: Record<string, unknown>; };
            }).generalStore;
            if (!gs?.project) {
                console.error("No project found in generalStore");
                return;
            }

            // Ensure currentPage exists
            if (!gs.currentPage) {
                try {
                    const url = new URL(location.href);
                    const parts = url.pathname.split("/").filter(Boolean);
                    const pageName = decodeURIComponent(parts[1] || "untitled");
                    const created = (gs.project as any).addPage?.(pageName, "tester");
                    if (created) {
                        gs.currentPage = created;
                        console.log("Created new currentPage");
                    } else {
                        // Alternative creation method
                        const items = (gs.project as any).items;
                        if (items && typeof (items as any).addNode === "function") {
                            const pageItem = (items as any).addNode("tester");
                            if (pageItem) {
                                (pageItem as any).updateText(pageName);
                                gs.currentPage = pageItem;
                                console.log("Created new currentPage via items.addNode");
                            }
                        }
                    }
                } catch (e) {
                    console.error("Error creating page:", e);
                }
            }

            const pageItem = gs?.currentPage;
            if (!pageItem) {
                console.error("currentPage still not available");
                return;
            }

            const items = pageItem.items;
            if (!items) {
                console.error("No items collection found on currentPage");
                return;
            }

            const lines = [
                "一行目: テスト",
                "二行目: Yjs 反映",
                "三行目: 並び順チェック",
            ];

            // Add items if they don't already exist
            const existingCount = (items as any).length ?? 0;
            console.log(`Current item count: ${existingCount}`);

            for (let i = existingCount; i < 3; i++) {
                const it = (items as any).addNode?.("tester");
                if (it && typeof (it as any).updateText === "function") {
                    (it as any).updateText(lines[i] || "");
                    console.log(`Added item ${i + 1}: ${lines[i]}`);
                } else {
                    console.error(`Failed to add item ${i + 1}`);
                }
            }
        });

        // Wait for a few seconds to let the changes propagate
        await page.waitForTimeout(5000);

        // Now wait for the outliner tree to be present and items to render
        // Note: The page title (index 0) doesn't have a data-item-id attribute, so we're looking for 3 items with data-item-id
        await page.waitForFunction(() => {
            // Try to access the outliner tree
            const outlinerTree = document.querySelector('[aria-label="アウトライナーツリー"]');

            // Check DOM count of items with data-item-id
            const domItemCount = document.querySelectorAll(".outliner-item[data-item-id]").length;

            console.log(`DOM item count: ${domItemCount}, outliner tree exists: ${!!outlinerTree}`);

            return domItemCount >= 3;
        }, {
            timeout: 120000, // 2 minutes
        });

        // Verify seeded lines exist in order under non-title items
        const texts = await page.evaluate(() =>
            Array.from(
                document.querySelectorAll(".outliner-item[data-item-id] .item-text"),
            ).map(el => (el.textContent ?? "").trim()).filter(Boolean)
        );

        console.log("Found texts:", texts);

        expect(texts.length).toBeGreaterThanOrEqual(3); // 1 page title + 2 content items
        expect(texts.slice(1, 3)).toEqual([ // Skip the page title (index 0), check items 1-2
            "一行目: テスト",
            "二行目: Yjs 反映",
        ]);
    });
});
