/** @feature FTR-e9bd4a60
 *  Title   : Unified project-management namespace
 *  Source  : docs/client-features/rte-management-namespace-e9bd4a60.yaml
 */
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

// Only the literal segment `-` is reserved (issue: unify project-scoped
// management routes under /:project/-/...). Everything else — including the
// words the management tools are named after — must stay usable as an
// ordinary page title, and the management tool itself must live one level
// deeper, under /:project/-/<tool>.
test.describe("FTR-e9bd4a60: project-management namespace", () => {
    test("an ordinary page named 'objects' is not shadowed by the Object Manager", async ({ page }, testInfo) => {
        const { projectName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Home"]);

        await page.goto(`/${encodeURIComponent(projectName)}/objects`);

        // The per-page toolbar (Schedule/Graph buttons) only renders on the
        // ordinary outline-page route, never on the Object Manager.
        await expect(page.getByTestId("graph-view-button")).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole("heading", { name: "Objects Manager" })).toHaveCount(0);
    });

    test("the Object Manager lives at /:project/-/objects", async ({ page }, testInfo) => {
        const { projectName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Home"]);

        await page.goto(`/${encodeURIComponent(projectName)}/-/objects`);

        await expect(page.getByRole("heading", { name: "Objects Manager" })).toBeVisible({ timeout: 15000 });
    });

    test(
        "ordinary pages named 'tables', 'settings' and 'graph' are not shadowed by management routes",
        async ({ page }, testInfo) => {
            const { projectName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Home"]);

            for (const title of ["tables", "settings", "graph"]) {
                await page.goto(`/${encodeURIComponent(projectName)}/${title}`);
                await expect(page.getByTestId("graph-view-button")).toBeVisible({ timeout: 15000 });
            }
        },
    );

    test("/:project/- opens the project-management landing page", async ({ page }, testInfo) => {
        const { projectName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Home"]);

        await page.goto(`/${encodeURIComponent(projectName)}/-`);

        const tools = page.getByTestId("management-landing-tools");
        await expect(tools).toBeVisible({ timeout: 15000 });
        for (
            const testId of ["management-landing-objects", "management-landing-tables", "management-landing-settings"]
        ) {
            await expect(page.getByTestId(testId)).toBeVisible();
        }
    });
});
