import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "../fixtures/console-forward";
import { TestHelpers } from "../utils/testHelpers";

test("Search panel input focuses automatically when opened", async ({ page }, testInfo) => {
    await TestHelpers.seedProjectAndNavigate(page, testInfo);

    // Open Search Panel
    await page.getByTestId("search-toggle-button").click();
    await expect(page.getByTestId("search-panel")).toBeVisible();

    // Assert input is focused
    const searchInput = page.getByTestId("search-input");
    await expect(searchInput).toBeFocused();

    // Try typing
    await page.keyboard.type("grandchild");
    await expect(searchInput).toHaveValue("grandchild");
});
