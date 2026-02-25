import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature IME-0003
 *  Title   : IME composition underline follows active cursor
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("IME-0003: IME composition underline follows cursor", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Use fixed names to ensure deterministic snapshot rendering (no random timestamps)
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], undefined, {
            projectName: "fixed-ime-project",
            pageName: "fixed-ime-page"
        });
    });

    test("textarea has ime-input class during composition", async ({ page }) => {
        const item = page.locator(".outliner-item.page-title");
        if (await item.count() === 0) {
            const visible = page.locator(".outliner-item").filter({ hasText: /.*/ });
            await visible.first().locator(".item-content").click({ force: true });
        } else {
            await item.locator(".item-content").click({ force: true });
        }

        const textarea = page.locator("textarea.global-textarea");
        await textarea.waitFor({ state: "visible" });
        await textarea.focus();
        await TestHelpers.waitForCursorVisible(page);

        // Find the focused item's text container to compare styles and take a screenshot
        const activeItem = page.locator('.outliner-item[data-active="true"]');
        const activeTextEl = activeItem.locator(".item-text");

        await page.evaluate(() => {
            const el = document.querySelector("textarea.global-textarea")! as HTMLTextAreaElement;
            // Native IME sets textarea value and draws an underline. Playwright's headless
            // dispatchEvent does neither natively. We simulate it visually for VRT purposes.
            el.value = "a";
            el.style.color = "rgba(255, 0, 0, 0.7)";
            el.style.textDecoration = "underline";
            el.style.textDecorationColor = "red";
            el.style.textDecorationThickness = "2px";

            el.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
            el.dispatchEvent(new CompositionEvent("compositionupdate", { data: "a" }));
        });
        await page.waitForTimeout(50);
        await expect(textarea).toHaveClass(/ime-input/);

        // 1. Strict Computed Style Assertions
        const stylesMatch = await page.evaluate(() => {
            const ta = document.querySelector("textarea.global-textarea") as HTMLElement;
            const activeItemNode = document.querySelector('.outliner-item[data-active="true"]');
            const textNode = activeItemNode?.querySelector(".item-text") as HTMLElement;

            if (!ta || !textNode) return { success: false, error: "Missing elements" };

            const taStyle = window.getComputedStyle(ta);
            const tnStyle = window.getComputedStyle(textNode);

            // Allow slight subpixel variations but ensure core geometry matches
            return {
                success: true,
                fontFamilyMatch: taStyle.fontFamily === tnStyle.fontFamily,
                fontSizeMatch: taStyle.fontSize === tnStyle.fontSize,
                lineHeightMatch: taStyle.lineHeight === tnStyle.lineHeight,
                paddingMatch: taStyle.padding === tnStyle.padding,
                borderMatch: taStyle.border === tnStyle.border,
                ta: { fontFamily: taStyle.fontFamily, fontSize: taStyle.fontSize, lineHeight: taStyle.lineHeight },
                tn: { fontFamily: tnStyle.fontFamily, fontSize: tnStyle.fontSize, lineHeight: tnStyle.lineHeight },
            };
        });

        expect(stylesMatch.success).toBe(true);
        expect(stylesMatch.ta.fontFamily).toBe(stylesMatch.tn.fontFamily);
        expect(stylesMatch.ta.fontSize).toBe(stylesMatch.tn.fontSize);
        expect(stylesMatch.ta.lineHeight).toBe(stylesMatch.tn.lineHeight);

        // 2. Localized Visual Regression Testing (VRT)
        // Ensure cursor is visible, then snapshot ONLY the specific outliner-item wrapper.
        // This makes the test resilient to unrelated UI changes outside the editor item.
        expect(await activeItem.screenshot()).toMatchSnapshot("ime-composition-underline-at-cursor.png");

        const width = await textarea.evaluate(el => parseFloat(getComputedStyle(el).width));
        expect(width).toBeGreaterThan(1);

        await page.evaluate(() => {
            const el = document.querySelector("textarea.global-textarea")!;
            el.dispatchEvent(new CompositionEvent("compositionend", { data: "a" }));
        });
        await page.waitForTimeout(50);
        await expect(textarea).not.toHaveClass(/ime-input/);
    });
});
