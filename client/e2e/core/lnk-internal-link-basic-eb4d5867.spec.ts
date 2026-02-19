import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature LNK-0002
 *  Title   : Internal link function verification
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0002: Basic internal link function", () => {
    let projectName: string;

    test.beforeEach(async ({ page }, testInfo) => {
        const result = await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "[test-page]",
            "Another item",
            "Third item",
        ]);
        projectName = result.projectName;
    });

    test("Internal links function correctly", async ({ page }) => {
        await page.waitForTimeout(500);
        const encodedProject = encodeURIComponent(projectName);
        const internalLink = page.locator(`a.internal-link[href="/${encodedProject}/test-page"]`);
        await expect(internalLink).toHaveCount(1);

        const target = await internalLink.getAttribute("target");
        expect(target).toBeNull();

        const className = await internalLink.getAttribute("class");
        expect(className).toContain("internal-link");

        const text = await internalLink.textContent();
        expect(text).toBe("test-page");
    });
});
