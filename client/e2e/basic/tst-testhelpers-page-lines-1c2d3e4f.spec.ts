import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test("TST-1c2d3e4f: prepare environment seeds lines", async ({ page }, testInfo) => {
    const lines = ["alpha", "beta"];
    const { pageName } = await TestHelpers.prepareTestEnvironment(page, testInfo, lines);
    await TestHelpers.waitForOutlinerItems(page);

    const uiTexts = await page.locator(".outliner-item:not(.page-title) .item-content").allTextContents();
    expect(uiTexts.slice(0, lines.length)).toEqual(lines);

    const storeTexts = await TestHelpers.getPageTexts(page);
    expect(storeTexts.map((i) => i.text).slice(0, lines.length)).toEqual(lines);

    const title = await page.locator(".page-title-content").innerText();
    expect(title).toContain(pageName);
});
