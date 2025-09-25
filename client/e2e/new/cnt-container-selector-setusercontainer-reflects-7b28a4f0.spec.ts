/** @feature CNT-7b28a4f0
 *  Title   : Eventless ContainerSelector via ucVersion
 *  Source  : docs/client-features/cnt-eventless-container-selector-7b28a4f0.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";

/**
 * @playwright
 * @title Dropdown updates after setUserContainer replacement (via fluid service)
 * @description Create a container via fluid (Yjs) service and then update userContainer via setUserContainer.
 *              ContainerSelector should immediately reflect the new option without relying on CustomEvent.
 */

test.describe("CNT-7b28a4f0: Eventless ContainerSelector", () => {
    test("option list updates after createNewProject + setUserContainer replacement", async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [], undefined, { stayOnHome: true });

        const select = page.locator("select.container-select");
        await expect(select).toBeVisible();

        // 0) Seed baseline container to observe a delta instead of placeholder option
        const baselineId = await page.evaluate(async () => {
            const svc: any = (window as any).__YJS_SERVICE__;
            if (!svc?.createClient) throw new Error("__YJS_SERVICE__.createClient is not available");
            const client = await svc.createClient();
            return client.containerId as string;
        });

        await page.evaluate(async (containerId) => {
            const fs: any = (window as any).__FIRESTORE_STORE__;
            if (!fs) throw new Error("__FIRESTORE_STORE__ is not available");
            const apply = () => {
                const now = new Date();
                fs.setUserContainer({
                    userId: "test-user-id",
                    defaultContainerId: containerId,
                    accessibleContainerIds: [containerId],
                    createdAt: now,
                    updatedAt: now,
                });
            };
            apply();
            await new Promise((r) => setTimeout(r, 200));
            apply();
        }, baselineId);

        await page.waitForFunction(
            (id) =>
                Array.from(document.querySelectorAll("select.container-select option")).some(option =>
                    option.value === id
                ),
            baselineId,
            { timeout: 10000 },
        );

        const initialCount = await select.locator("option").count();

        // 1) Create a new client via fluid (Yjs) service to ensure a unique containerId
        const newId = await page.evaluate(async () => {
            const svc: any = (window as any).__YJS_SERVICE__;
            if (!svc?.createClient) throw new Error("__YJS_SERVICE__.createClient is not available");
            const client = await svc.createClient();
            return client.containerId as string;
        });

        // 2) Replace userContainer via store API (setUserContainer) with baseline + new container
        await page.evaluate(async ([existingId, containerId]) => {
            const fs: any = (window as any).__FIRESTORE_STORE__;
            if (!fs) throw new Error("__FIRESTORE_STORE__ is not available");
            const apply = () => {
                const now = new Date();
                fs.setUserContainer({
                    userId: "test-user-id",
                    defaultContainerId: containerId,
                    accessibleContainerIds: [existingId, containerId],
                    createdAt: now,
                    updatedAt: now,
                });
            };
            apply();
            await new Promise((r) => setTimeout(r, 200));
            apply();
        }, [baselineId, newId]);

        // 3) Wait for UI to reflect the change (eventless path)
        await page.waitForFunction(
            (count) => document.querySelectorAll("select.container-select option").length > count,
            initialCount,
            { timeout: 10000 },
        );

        await expect(select.locator("option")).toHaveCount(initialCount + 1);
    });
});
