/** @feature FFI-0001
 *  Title   : Fluid Framework Integration
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FFI-0001: Fluid container operations", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("create and list containers", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const svc = (window as any).__LEGACY_FLUID_SERVICE__; // Changed to use legacy service
            if (!svc) throw new Error("Legacy Fluid service (__LEGACY_FLUID_SERVICE__) not found on window");
            const client = await svc.createNewContainer("Test Project");
            const list = await svc.listContainers();
            return { id: client.containerId, listLength: list.length };
        });

        expect(result.id).toBeTruthy();
        expect(result.listLength).toBeGreaterThan(0);
    });
});
