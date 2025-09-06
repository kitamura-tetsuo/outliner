import { test, expect } from "@playwright/test";

// Ensure no Fluid service is exposed

test("no Fluid service exposed globally", async ({ page }) => {
    await page.goto("/yjs-outliner");
    const hasService = await page.evaluate(() => typeof (window as any).__FLUID_SERVICE__ !== "undefined");
    expect(hasService).toBe(false);
});
