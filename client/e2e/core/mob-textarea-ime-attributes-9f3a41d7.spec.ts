import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.use({
    hasTouch: true,
    isMobile: true,
    userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
});

test.describe("Mobile textarea IME attributes", () => {
    test(
        "global textarea has correct IME attributes to disable autocapitalize and autocorrect",
        async ({ page }, testInfo) => {
            await TestHelpers.seedProjectAndNavigate(page, testInfo, ["item1"]);

            const textarea = page.locator(".global-textarea");

            await expect(textarea).toHaveAttribute("autocapitalize", "off");
            await expect(textarea).toHaveAttribute("autocorrect", "off");
            await expect(textarea).toHaveAttribute("autocomplete", "off");
            await expect(textarea).toHaveAttribute("spellcheck", "false");
            await expect(textarea).toHaveAttribute("enterkeyhint", "enter");
            await expect(textarea).toHaveAttribute("inputmode", "text");
        },
    );
});
