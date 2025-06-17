import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

// E2E test for Client-Side WASM DB

test.describe("DBW-0001: WASM DB container meta", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], true, true);
    });

    test("creates container meta and lists it", async ({ page }) => {
        const id = await page.evaluate(async () => {
            const svc = window.__FLUID_SERVICE__;
            const client = await svc.createNewContainer("WASM Test");
            return client.containerId;
        });

        const list = await page.evaluate(async () => {
            const svc = window.__FLUID_SERVICE__;
            return await svc.listContainers();
        });

        const found = list.find((c: any) => c.id === id);
        expect(found).toBeTruthy();
        expect(found.title).toBe("WASM Test");
    });
});

