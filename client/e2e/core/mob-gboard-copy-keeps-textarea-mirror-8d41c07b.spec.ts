import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature MOB-8d41c07b
 *  Title   : Software keyboard cursor control stays usable after copy
 *  Source  : docs/client-features.yaml
 */
import { devices, expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.use({ ...devices["Pixel 7"] });

/**
 * Reproduces the Gboard cursor-control panel flow on Android:
 * select from the panel -> copy -> the keyboard collapses the selection.
 *
 * The hidden `.global-textarea` is the element the software keyboard is attached to, so it
 * must still mirror the item's text once the selection is gone. When it was blanked, Gboard
 * saw an empty editor and grayed out the whole cursor-control panel until the user tapped
 * the item again.
 */
test.describe("MOB-8d41c07b: keyboard cursor control after copy", () => {
    test(
        "keeps the hidden textarea mirroring the item after the IME collapses the selection",
        async ({ page }, testInfo) => {
            await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Hello World"]);
            await TestHelpers.waitForOutlinerItems(page);

            // Index 0 is the page title, index 1 is the seeded item.
            const item = page.locator(".outliner-item").nth(1);
            await item.waitFor({ state: "visible" });
            const itemId = await item.getAttribute("data-item-id");
            expect(itemId).toBeTruthy();

            // Activate the item through the store: tap handling is flaky under the mobile emulation
            // profile, and the caret placement itself is not what this spec covers.
            await page.evaluate((id) => {
                const store = (globalThis as unknown as {
                    editorOverlayStore?: {
                        setActiveItem: (id: string) => void;
                        setCursor: (c: { itemId: string; offset: number; isActive: boolean; userId: string; }) => void;
                    };
                }).editorOverlayStore;
                if (!store || !id) return;
                store.setActiveItem(id);
                store.setCursor({ itemId: id, offset: 0, isActive: true, userId: "local" });
                (document.querySelector("textarea.global-textarea") as HTMLTextAreaElement | null)?.focus();
            }, itemId);

            const textarea = page.locator("textarea.global-textarea");
            await expect(textarea).toHaveValue("Hello World");
            // Let the programmatic selection suppression window (50ms) expire.
            await page.waitForTimeout(200);

            // The panel selects "Hello": an OS-driven selection lands straight on the textarea.
            await textarea.evaluate((el: HTMLTextAreaElement) => {
                el.setSelectionRange(0, 5);
                document.dispatchEvent(new Event("selectionchange"));
            });
            await page.waitForTimeout(200);

            // The panel's copy button reaches the page as a trusted copy command.
            await page.keyboard.press("Control+c");
            await page.waitForTimeout(200);

            // Gboard collapses the selection right after copying.
            await textarea.evaluate((el: HTMLTextAreaElement) => {
                el.setSelectionRange(5, 5);
                document.dispatchEvent(new Event("selectionchange"));
            });
            await page.waitForTimeout(300);

            // The collapse must have reached the store: that is the path which used to blank
            // the mirror, so asserting it keeps the checks below from passing vacuously.
            await expect.poll(async () =>
                await page.evaluate(() => {
                    const store = (globalThis as unknown as {
                        editorOverlayStore?: { selections: Record<string, { userId?: string; }>; };
                    }).editorOverlayStore;
                    return Object.values(store?.selections ?? {}).filter(s => (s.userId ?? "local") === "local").length;
                })
            ).toBe(0);
            expect(await TestHelpers.waitForCursorVisible(page)).toBe(true);

            // The keyboard must still see the item's text; an empty mirror is what grays out the panel.
            await expect(textarea).toHaveValue("Hello World");
            expect(await textarea.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe(5);

            // The virtual cursor is still live at the offset the keyboard left behind.
            await page.keyboard.type("!");
            await expect(page.locator(`[data-item-id="${itemId}"] .item-text`)).toHaveText("Hello! World");
        },
    );
});
