import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../../utils/registerCoverageHooks";
import { TestHelpers } from "../../utils/testHelpers";

registerCoverageHooks();

/**
 * @feature MOB-0003
 *  Title   : Mobile Bottom Action Toolbar
 *  Source  : docs/client-features/mob-mobile-action-toolbar-2738d410.yaml
 */
test.describe("Mobile Action Toolbar", () => {
    // Mobile viewport so OutlinerToolbar renders its mobile branch
    test.use({ viewport: { width: 375, height: 667 } });

    test("is visible and anchored to the bottom of the viewport", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Mobile toolbar item"]);

        const toolbar = page.getByTestId("mobile-action-toolbar");
        await expect(toolbar).toBeVisible();

        // The toolbar is offset from the bottom by mobileToolbarBottomOffset,
        // which stays at 0 while no virtual keyboard is shown.
        await expect(toolbar).toHaveCSS("bottom", "0px");
    });
});
