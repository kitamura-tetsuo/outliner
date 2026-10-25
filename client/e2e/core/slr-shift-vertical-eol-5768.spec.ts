import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { selectionEndpoints } from "../utils/selectionGeometryHelpers";
import { TestHelpers } from "../utils/testHelpers";

test("Shift+Down preserves the established EOL-to-EOL selection policy", async ({ page }, testInfo) => {
    await TestHelpers.seedProjectAndNavigate(page, testInfo, ["first", "second"]);
    const ids = await page.locator(".outliner-item[data-item-id]").evaluateAll(elements =>
        elements.map(element => element.getAttribute("data-item-id")!).slice(1)
    );
    await page.locator(`[data-item-id="${ids[0]}"] .item-content`).click({ force: true });
    await TestHelpers.focusGlobalTextarea(page);
    await page.keyboard.press("End");
    await page.keyboard.press("Shift+ArrowDown");

    await expect.poll(() => selectionEndpoints(page)).toMatchObject({
        startItemId: ids[0],
        startOffset: 5,
        endItemId: ids[1],
        endOffset: 6,
    });
    await expect(page.locator("textarea.global-textarea")).toBeFocused();
});
