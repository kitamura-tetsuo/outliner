import "../utils/registerAfterEachSnapshot";
import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

// FTR-784f295f: the /demo route has a button that manually triggers the
// 24h demo content reset.
test.describe("Demo manual reset button", () => {
    test("clicking the reset button shows confirmation, and confirming forces a reseed", async ({ page }) => {
        // Collect console warnings during the test
        const warnings: string[] = [];
        page.on("console", (msg) => {
            if (msg.type() === "warning") {
                warnings.push(msg.text());
            }
        });

        await page.goto("/demo");

        const pageList = page.getByTestId("demo-page-list");
        await expect(pageList).toBeVisible({ timeout: 30000 });

        const resetButton = page.getByTestId("demo-reset-button");
        await expect(resetButton).toBeVisible();
        await expect(resetButton).toBeEnabled();

        // 1. Click reset button, should open dialog
        await resetButton.click();
        const dialog = page.getByRole("alertdialog");
        await expect(dialog).toBeVisible();
        await expect(page.getByText("This action will erase all current edits")).toBeVisible();

        // 2. Click Cancel, should close dialog and NOT send request
        const cancelButton = page.getByRole("button", { name: "Cancel" });
        await cancelButton.click();
        await expect(dialog).toBeHidden();

        // 3. Click reset again, and this time confirm
        await resetButton.click();
        await expect(dialog).toBeVisible();

        const confirmButton = page.getByRole("button", { name: "Reset", exact: true });
        const [response] = await Promise.all([
            page.waitForResponse(resp => resp.url().includes("/api/seed-demo") && resp.request().method() === "POST", {
                timeout: 30000,
            }),
            confirmButton.click(),
        ]);

        const body = await response.json();
        expect(body.success).toBe(true);
        expect(body.reset).toBe(true);

        await expect(dialog).toBeHidden();
        await expect(page.getByTestId("demo-reset-done")).toBeVisible({ timeout: 15000 });

        // The reseeded demo content is still shown afterwards.
        await expect(pageList.getByText("Welcome", { exact: true }).first()).toBeVisible({ timeout: 15000 });
        await expect(pageList.getByText("Formatting", { exact: true }).first()).toBeVisible({ timeout: 15000 });

        // Ensure we do not flood the console with opaque AppSchema warnings during reset
        const appSchemaWarnings = warnings.filter(w =>
            w.includes("Silenced schema error") || w.includes("Silenced error")
        );
        expect(
            appSchemaWarnings.length,
            `Found ${appSchemaWarnings.length} AppSchema warnings during reset, expected 0. Samples: ${
                appSchemaWarnings.slice(0, 3).join(", ")
            }`,
        ).toBe(0);
    });
});
