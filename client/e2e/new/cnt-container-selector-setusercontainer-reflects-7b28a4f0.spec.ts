import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature CNT-7b28a4f0
 *  Title   : Eventless ContainerSelector via ucVersion
 *  Source  : docs/client-features/cnt-eventless-container-selector-7b28a4f0.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @playwright
 * @title Dropdown updates after setUserContainer replacement (via fluid service)
 * @description Create a container via fluid (Yjs) service and then update userContainer via setUserContainer.
 *              ContainerSelector should immediately reflect the new option without relying on CustomEvent.
 */

test.describe("CNT-7b28a4f0: Eventless ContainerSelector", () => {
    test("option list updates after createNewProject + setUserContainer replacement", async ({ page }, testInfo) => {
        // ContainerSelector is on the home page, not project pages
        // Use skipSync to avoid navigating to a project page
        await TestHelpers.prepareTestEnvironmentForProject(page, testInfo, [], undefined, { skipSync: true });

        // Navigate to home page where ContainerSelector is rendered
        // prepareTestEnvironmentForProject already navigates to "/" with skipSync
        await page.waitForFunction(() => {
            return (window as any).__E2E__ === true && !!(window as any).__FIRESTORE_STORE__
                && !!(window as any).__USER_MANAGER__;
        }, { timeout: 30000 });
        console.log("[E2E-DEBUG] Environment and Stores confirmed.");

        // Set up accessible projects for container selector
        await TestHelpers.setAccessibleProjects(page, ["test-project-1", "test-project-2"]);

        const select = page.locator("select.project-select");

        // Debug/Wait for wrapper first
        await page.waitForSelector(".project-selector-wrapper", { timeout: 10000 });

        // Wait for select to be attached to DOM
        await select.waitFor({ state: "attached", timeout: 10000 });
        await expect(select).toBeVisible();

        // 0) Seed baseline container to observe a delta instead of placeholder option
        const baselineId = await page.evaluate(async () => {
            const svc: any = (window as any).__YJS_SERVICE__;
            if (!svc?.createClient) throw new Error("__YJS_SERVICE__.createClient is not available");
            const client = await svc.createClient();
            return (client.projectId || client.containerId) as string;
        });

        await page.evaluate(async (projectId) => {
            const fs: any = (window as any).__FIRESTORE_STORE__;
            const um: any = (window as any).__USER_MANAGER__;
            const userId = um?.auth?.currentUser?.uid || "test-user-id";
            if (!fs) throw new Error("__FIRESTORE_STORE__ is not available");
            const apply = () => {
                const now = new Date();
                console.log(`[E2E-TEST] Applying setUserProject for userId=${userId}, projectId=${projectId}`);
                fs.setUserProject({
                    userId: userId,
                    defaultProjectId: projectId,
                    accessibleProjectIds: [projectId],
                    createdAt: now,
                    updatedAt: now,
                });
            };
            apply();
            await new Promise((r) => setTimeout(r, 200));
            apply();
        }, baselineId);

        await page.waitForFunction(
            (id) => {
                const options = Array.from(document.querySelectorAll("select.project-select option"));
                console.log(
                    `[E2E-DEBUG] Current options: ${options.map(o => (o as HTMLOptionElement).value).join(", ")}`,
                );
                return options.some(option => (option as HTMLOptionElement).value === id);
            },
            baselineId,
            { timeout: 30000 },
        ).catch(async (e) => {
            const html = await page.innerHTML("select.project-select");
            console.error(`[E2E-ERROR] Options search failed for ${baselineId}. Current HTML: ${html}`);
            throw e;
        });

        const initialCount = await select.locator("option").count();

        // 1) Create a new client via fluid (Yjs) service to ensure a unique containerId
        const newId = await page.evaluate(async () => {
            const svc: any = (window as any).__YJS_SERVICE__;
            if (!svc?.createClient) throw new Error("__YJS_SERVICE__.createClient is not available");
            const client = await svc.createClient();
            return (client.projectId || client.containerId) as string;
        });

        // 2) Replace userProject via store API (setUserProject) with baseline + new project
        await page.evaluate(async ([existingId, projectId]) => {
            const fs: any = (window as any).__FIRESTORE_STORE__;
            const um: any = (window as any).__USER_MANAGER__;
            const userId = um?.auth?.currentUser?.uid || "test-user-id";
            if (!fs) throw new Error("__FIRESTORE_STORE__ is not available");
            const apply = () => {
                const now = new Date();
                console.log(
                    `[E2E-TEST] Applying second setUserProject for userId=${userId}, existingId=${existingId}, newId=${projectId}`,
                );
                fs.setUserProject({
                    userId: userId,
                    defaultProjectId: projectId,
                    accessibleProjectIds: [existingId, projectId],
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
            (count) => {
                const options = document.querySelectorAll("select.project-select option");
                console.log(`[E2E-DEBUG] Current count: ${options.length}, target > ${count}`);
                return options.length > count;
            },
            initialCount,
            { timeout: 30000 },
        );

        await expect(select.locator("option")).toHaveCount(initialCount + 1);
    });
});
