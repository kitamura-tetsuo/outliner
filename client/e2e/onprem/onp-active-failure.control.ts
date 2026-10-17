import { expect, test } from "@playwright/test";
import { OnPremProductionStack } from "./onpremProductionStack";

test("negative control preserves unexpected active-path failure", async ({ page }) => {
    const stack = new OnPremProductionStack(50);
    await stack.start();
    try {
        await stack.shutdownBackend();
        const response = await page.goto(`${stack.origin}/api/deployment`);
        console.log(`ACTIVE_PATH_RESPONSE_STATUS=${response?.status()}`);
        expect(response?.ok(), "ACTIVE_PATH_EXPECTED_SUCCESS_ASSERTION").toBe(true);
    } finally {
        await stack.stop();
    }
});
