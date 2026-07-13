import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature MOB-0004
 *  Title   : Mobile item row full-width text with toolbar actions
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

const LONG_TEXT =
    "Items can carry comment threads and votes without the sentence collapsing into single characters per line.";

test.describe("MOB-0004: Mobile item row full-width text", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await page.setViewportSize({ width: 375, height: 700 });
        await TestHelpers.seedProjectAndNavigate(page, testInfo, [LONG_TEXT]);

        const sidebarToggle = page.locator('button[aria-label*="sidebar"]').first();
        const sidebar = page.locator(".sidebar.open");
        if (await sidebar.isVisible().catch(() => false)) {
            await sidebarToggle.click();
            await page.waitForTimeout(400);
        }

        await TestHelpers.waitForOutlinerItems(page);
    });

    test("item text spans the full row instead of wrapping to a single narrow column", async ({ page }) => {
        const contentItem = page.locator(".outliner-item").nth(1);
        await contentItem.waitFor({ state: "visible" });

        const textBox = await contentItem.locator(".item-text").first().boundingBox();
        const contentBox = await contentItem.locator(".item-content").first().boundingBox();
        expect(textBox).not.toBeNull();
        expect(contentBox).not.toBeNull();

        // A squeezed one-character-per-line column is only a few px wide; the
        // fixed row width should be used almost entirely for text instead.
        expect(textBox!.width).toBeGreaterThan(contentBox!.width * 0.8);

        // Per-item Add/Delete/Vote buttons no longer reserve horizontal space.
        await expect(contentItem.locator(".item-actions")).not.toBeVisible();
    });

    test("trailing controls become visible and right-aligned only while editing", async ({ page }) => {
        const contentItem = page.locator(".outliner-item").nth(1);
        const itemId = await contentItem.getAttribute("data-item-id");

        const commentButton = contentItem.locator("[data-testid^='comment-button-']");
        await expect(commentButton).toBeHidden();

        await page.evaluate((id) => {
            const store = (globalThis as any).editorOverlayStore;
            if (store && id) {
                store.setActiveItem(id);
                store.setCursor({ itemId: id, offset: 0, isActive: true, userId: "local" });
                const ta = document.querySelector("textarea.global-textarea") as HTMLTextAreaElement;
                if (ta) ta.focus();
            }
        }, itemId);
        await page.waitForTimeout(300);

        await expect(commentButton).toBeVisible();

        const contentBox = await contentItem.locator(".item-content").first().boundingBox();
        const commentBox = await commentButton.boundingBox();
        expect(contentBox).not.toBeNull();
        expect(commentBox).not.toBeNull();
        // Right-aligned: the button should sit near the right edge of the row.
        expect(commentBox!.x + commentBox!.width).toBeGreaterThan(contentBox!.x + contentBox!.width - 40);
    });

    test("mobile toolbar Vote and Delete buttons act on the active item", async ({ page }) => {
        const toolbar = page.locator("[data-testid='mobile-action-toolbar']");
        const contentItem = page.locator(".outliner-item").nth(1);
        const itemId = await contentItem.getAttribute("data-item-id");

        await page.evaluate((id) => {
            const store = (globalThis as any).editorOverlayStore;
            if (store && id) store.setActiveItem(id);
        }, itemId);
        await page.waitForTimeout(300);

        await toolbar.locator("button[aria-label='Vote']").click();
        await page.waitForTimeout(300);
        await expect(contentItem.locator(".vote-count")).toHaveText("1");

        page.once("dialog", (dialog) => dialog.accept());
        const countBefore = await page.locator(".outliner-item").count();
        await toolbar.locator("button[aria-label='Delete']").click();
        await expect(page.locator(".outliner-item")).toHaveCount(countBefore - 1);
    });
});
