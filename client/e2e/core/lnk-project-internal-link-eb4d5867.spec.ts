import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature LNK-0002
 *  Title   : Internal Link Functionality Verification
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0002: Project Internal Link", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "[/project-name/page-name]",
            "Another item",
            "Third item",
        ]);
    });

    test("Project internal link functions correctly", async ({ page }) => {
        const projectLink = page.locator('a.internal-link.project-link[href="/project-name/page-name"]');
        await projectLink.waitFor({ state: "visible", timeout: 10000 });
        await expect(projectLink).toHaveCount(1);

        const target = await projectLink.getAttribute("target");
        expect(target).toBeNull();

        const className = await projectLink.getAttribute("class");
        expect(className).toContain("internal-link");
        expect(className).toContain("project-link");

        const text = await projectLink.textContent();
        expect(text).toBe("project-name/page-name");
    });
});
