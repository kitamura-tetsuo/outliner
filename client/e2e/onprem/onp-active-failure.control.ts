import { expect, test } from "@playwright/test";
import { OnPremProductionStack } from "./onpremProductionStack";

test("negative control preserves unexpected active-path failure", async ({ page }) => {
    const stack = new OnPremProductionStack(50);
    await stack.start();
    try {
        await stack.shutdownBackend();
        const response = await page.goto(`${stack.origin}/api/deployment`);
        expect(response?.ok(), "an expected-success request must expose its active-path failure").toBe(true);
    } finally {
        await stack.stop();
    }
});
