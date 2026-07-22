import { expect, test } from "@playwright/test";

/** @feature ENV-a5b6c7d8
 *  Title   : Ensure no Fluid service is exposed globally
 *  Source  : docs/dev-features/env-no-fluid-service-global-a5b6c7d8.yaml
 */
test("window.fluidService is undefined", async ({ page }) => {
    await page.goto("/");
    // Wait for the application to mount
    await page.waitForSelector("#outliner-container", { state: "attached", timeout: 10000 }).catch(() => {});

    const isFluidServiceDefined = await page.evaluate(() => {
        return typeof (window as any).fluidService !== "undefined";
    });

    expect(isFluidServiceDefined).toBe(false);
});
