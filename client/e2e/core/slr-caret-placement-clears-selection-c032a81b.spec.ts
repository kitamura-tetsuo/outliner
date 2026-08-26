import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("SLR-0004: ordinary caret placement", () => {
    test(
        "clicking another item clears the authoritative local selection and its highlight",
        async ({ page }, testInfo) => {
            await TestHelpers.seedProjectAndNavigate(page, testInfo, ["First selectable text", "Second caret target"]);
            await TestHelpers.waitForOutlinerItems(page, 3, 10000);

            const textItems = page.locator('.outliner-item[data-node-kind="text"]');
            const first = textItems.filter({ hasText: "First selectable text" });
            const second = textItems.filter({ hasText: "Second caret target" });
            const secondId = await second.getAttribute("data-item-id");
            expect(secondId).not.toBeNull();

            await first.locator(".item-content").click();
            await page.keyboard.press("Home");
            await page.keyboard.press("Shift+End");
            await expect(page.locator(".editor-overlay .selection")).toBeVisible();

            await second.locator(".item-content").click({ position: { x: 30, y: 8 } });

            await expect(page.locator(".editor-overlay .selection")).toHaveCount(0);
            await expect.poll(() =>
                page.evaluate(() => {
                    const store = (globalThis as typeof globalThis & {
                        editorOverlayStore?: {
                            selections: Record<string, { userId?: string; }>;
                            cursors: Record<string, { itemId: string; userId?: string; }>;
                        };
                    }).editorOverlayStore;
                    return {
                        localSelections: Object.values(store?.selections ?? {}).filter(selection =>
                            (selection.userId ?? "local") === "local"
                        ).length,
                        localCursorItem: Object.values(store?.cursors ?? {}).find(cursor =>
                            (cursor.userId ?? "local") === "local"
                        )?.itemId,
                    };
                })
            ).toEqual({ localSelections: 0, localCursorItem: secondId });
            await TestHelpers.waitForCursorVisible(page);
        },
    );
});
