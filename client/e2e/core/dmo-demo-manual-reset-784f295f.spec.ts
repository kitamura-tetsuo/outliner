import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// FTR-784f295f: the /demo route has a button that manually triggers the
// 24h demo content reset.
test.describe("Demo manual reset button", () => {
    test("clicking the reset button forces a reseed and confirms completion", async ({ page }) => {
        await page.goto("/demo");

        const pageList = page.getByTestId("demo-page-list");
        await expect(pageList).toBeVisible({ timeout: 30000 });

        const resetButton = page.getByTestId("demo-reset-button");
        await expect(resetButton).toBeVisible();
        await expect(resetButton).toBeEnabled();

        // The forced reset must report reset=true even though the demo was
        // just seeded by opening the route (i.e. well within the 24h globalThis).
        const [response] = await Promise.all([
            page.waitForResponse(resp => resp.url().includes("/api/seed-demo") && resp.request().method() === "POST", {
                timeout: 30000,
            }),
            resetButton.click(),
        ]);
        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.reset).toBe(true);

        await expect(page.getByTestId("demo-reset-done")).toBeVisible({ timeout: 15000 });

        // The reseeded demo content is still shown afterwards.
        await expect(pageList.getByText("Demo", { exact: true }).first()).toBeVisible({ timeout: 15000 });
        await expect(pageList.getByText("Formatting", { exact: true }).first()).toBeVisible({ timeout: 15000 });
    });
});
