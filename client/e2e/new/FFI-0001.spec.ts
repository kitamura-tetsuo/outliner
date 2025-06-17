/** @feature FFI-0001
 *  Title   : Fluid Framework Integration
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers, FluidServiceHelper } from "../utils/testHelpers";

test.describe("FFI-0001: Fluid container operations", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("create and list containers", async ({ page }) => {
        const client = await FluidServiceHelper.createNewContainer(page, "Test Project");
        const list = await FluidServiceHelper.listContainers(page);
        const result = { id: client.containerId, listLength: list.length };

        expect(result.id).toBeTruthy();
        expect(result.listLength).toBeGreaterThan(0);
    });
});
