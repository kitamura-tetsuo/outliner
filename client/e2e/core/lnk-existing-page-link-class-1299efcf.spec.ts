import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature LNK-1299EFCF
 *  Title   : Existing page links are not marked page-not-exists
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

// Regression test for GitHub issue #3377: the page-names cache failed to
// normalize Y.Text values, so every internal link (even to pages that exist)
// rendered with the `page-not-exists` class.
test.describe("LNK-1299efcf: Existing page links are not marked page-not-exists", () => {
    test("Link to an existing page has no page-not-exists class; link to a missing page does", async ({ page }, testInfo) => {
        const { SeedClient } = await import("../utils/seedClient.js");
        const authToken = await TestHelpers.getTestAuthToken();
        const workerIndex = typeof testInfo?.workerIndex === "number" ? testInfo.workerIndex : 1;
        const timestamp = Date.now();
        const projectName = `Test Project ${workerIndex} ${timestamp}`;
        const targetPageName = `Existing-Target-Page-${timestamp}`;
        const linkingPageName = `linking-page-${timestamp}`;
        const missingPageName = `missing-page-${timestamp}`;

        const seeder = new SeedClient(projectName, authToken);
        // Seed the target page first so it exists in the project before the
        // linking page (with the reference to it) is created.
        await seeder.seed([
            { name: targetPageName, lines: ["Target page content"] },
            { name: linkingPageName, lines: [`Link to [${targetPageName}] and [${missingPageName}]`] },
        ]);

        await TestHelpers.seedProjectAndNavigate(page, testInfo, [], undefined, {
            projectName,
            pageName: linkingPageName,
            doNotSeed: true,
        });

        const encodedProject = encodeURIComponent(projectName);

        const existingLink = page.locator(
            `a.internal-link[href="/${encodedProject}/${encodeURIComponent(targetPageName)}"]`,
        );
        await expect(existingLink).toBeVisible({ timeout: 15000 });
        const existingLinkClass = await existingLink.getAttribute("class");
        expect(existingLinkClass).not.toContain("page-not-exists");

        const missingLink = page.locator(
            `a.internal-link[href="/${encodedProject}/${encodeURIComponent(missingPageName)}"]`,
        );
        await expect(missingLink).toBeVisible({ timeout: 15000 });
        const missingLinkClass = await missingLink.getAttribute("class");
        expect(missingLinkClass).toContain("page-not-exists");
    });
});
