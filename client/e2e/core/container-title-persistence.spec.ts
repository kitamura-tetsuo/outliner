import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

import { expect, type Page, test } from "@playwright/test";
import { SeedClient } from "../utils/seedClient";
import { TestHelpers } from "../utils/testHelpers";

async function selectorOptions(page: Page): Promise<string[]> {
    const selector = page.locator("select.project-select");
    await expect(selector).toBeVisible();
    return await selector.locator("option").allInnerTexts();
}

test.describe("Canonical project title persistence", () => {
    test("resource-side title remains visible after reload", async ({ page }, testInfo) => {
        const { projectName } = await TestHelpers.seedProjectAndNavigate(page, testInfo);
        const projectId = SeedClient.stableIdFromTitle(projectName);

        await page.goto("/", { waitUntil: "domcontentloaded" });
        await TestHelpers.setAccessibleProjects(page, [projectId]);
        expect((await selectorOptions(page)).some(option => option.includes(projectName))).toBe(true);

        await page.reload({ waitUntil: "domcontentloaded" });
        await TestHelpers.setAccessibleProjects(page, [projectId]);
        expect((await selectorOptions(page)).some(option => option.includes(projectName))).toBe(true);
    });

    test("canonical rename survives reload", async ({ page }, testInfo) => {
        const { projectName } = await TestHelpers.seedProjectAndNavigate(page, testInfo);
        const projectId = SeedClient.stableIdFromTitle(projectName);
        const renamedTitle = `${projectName} renamed`;
        const token = await page.evaluate(async () => {
            return await (globalThis as any).__USER_MANAGER__?.auth?.currentUser?.getIdToken();
        });
        const apiUrl = process.env.VITE_YJS_API_URL || `http://127.0.0.1:${process.env.VITE_YJS_PORT || 7093}`;
        const response = await fetch(`${apiUrl}/api/projects/${encodeURIComponent(projectId)}/rename`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ title: renamedTitle }),
        });
        expect(response.ok).toBe(true);

        await page.goto("/", { waitUntil: "domcontentloaded" });
        await TestHelpers.setAccessibleProjects(page, [projectId]);
        expect((await selectorOptions(page)).some(option => option.includes(renamedTitle))).toBe(true);
    });

    test("a forged userProjects membership does not enter the directory", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo);
        const forgedId = `forged-${Date.now()}`;
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => !!(globalThis as any).__PROJECT_STORE__);
        await page.evaluate(async (projectId) => {
            const firestoreStore = (globalThis as any).__FIRESTORE_STORE__;
            firestoreStore.setUserProject({
                userId: (globalThis as any).__USER_MANAGER__.auth.currentUser.uid,
                defaultProjectId: projectId,
                accessibleProjectIds: [projectId],
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            await (globalThis as any).__PROJECT_STORE__.syncFromFirestore();
        }, forgedId);
        expect((await selectorOptions(page)).some(option => option.includes(forgedId))).toBe(false);
    });
});
