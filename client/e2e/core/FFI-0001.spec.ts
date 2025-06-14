import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("FFI-0001: Fluid container operations", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("create and list containers", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const svc = window.__FLUID_SERVICE__;
            const client = await svc.createNewContainer("Test Project");
            const list = await svc.listContainers();
            return { id: client.containerId, listLength: list.length };
        });

        expect(result.id).toBeTruthy();
        expect(result.listLength).toBeGreaterThan(0);
    });
});
