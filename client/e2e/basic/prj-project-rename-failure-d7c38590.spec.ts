import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";

registerCoverageHooks();

test.describe("Project Rename Failure Handling", () => {
    test("shows error on rename timeout instead of redirecting", async ({ page }, testInfo) => {
        const baseProjectName = `Test Rename Project ${Date.now()}`;
        const { projectName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, [], undefined, {
            projectName: baseProjectName,
        });

        // Use the exact flow from project-sharing.spec.ts to navigate
        await TestHelpers.waitForAppReady(page);

        // Ensure project exists in Firestore (required for sharing) with the HASHED ID
        await page.evaluate(async ({ projectName }) => {
            const userManager = (globalThis as any).__USER_MANAGER__;
            if (!userManager) throw new Error("UserManager not found");

            const token = await userManager.auth.currentUser?.getIdToken();
            if (!token) throw new Error("Not logged in");

            function stableIdFromTitle(title: string): string {
                let h = 2166136261 >>> 0; // FNV-1a basis
                for (let i = 0; i < title.length; i++) {
                    h ^= title.charCodeAt(i);
                    h = (h * 16777619) >>> 0;
                }
                const hex = h.toString(16);
                return `p${hex}`;
            }
            const projectId = stableIdFromTitle(projectName);

            const res = await fetch("/api/saveProject", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    idToken: token,
                    projectId: projectId,
                    title: projectName,
                }),
            });

            if (!res.ok) {
                // If it fails, ignore as local store handles it in E2E
            }
        }, { projectName });

        await page.goto(`/settings/${encodeURIComponent(projectName)}`);

        await expect(page.locator("h1")).toContainText(`Settings`, { timeout: 15000 });

        // Wait for inputs
        const titleInput = page.locator("input#title");

        try {
            await expect(titleInput).toBeVisible({ timeout: 10000 });
        } catch {
            // If input not visible, manually add it directly to projectStore
            // because "Project not found" might be showing due to `projectStore.projects` being empty locally.
            await page.evaluate((name) => {
                const projStore = (globalThis as any).projectStore;
                if (projStore) {
                    projStore.projects = [{ name, id: "ptest123" + Date.now() }];
                }
                const fsStore = (globalThis as any).__FIRESTORE_STORE__;
                if (fsStore) {
                    const id = "ptest123" + Date.now();
                    fsStore.setUserProject({
                        userId: "test-user",
                        defaultProjectId: id,
                        accessibleProjectIds: [id],
                        projectTitles: { [id]: name },
                    });
                }
            }, projectName);
            await expect(titleInput).toBeVisible({ timeout: 15000 });
        }

        await titleInput.fill("Failing New Title");

        // Block the canonical project-directory rename request.
        await page.evaluate(() => {
            const originalFetch = globalThis.fetch;
            globalThis.fetch = async (...args) => {
                if (
                    args[0] && typeof args[0] === "string" && args[0].includes("/api/projects/")
                    && args[0].endsWith("/rename")
                ) {
                    await new Promise((resolve) => setTimeout(resolve, 250));
                    return new Response(JSON.stringify({ error: "simulated rename failure" }), {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    });
                }
                return originalFetch(...args);
            };
        });

        const saveBtn = page.getByRole("button", { name: "Save Changes" });
        await saveBtn.click();

        // The button should change to "Saving..."
        await expect(page.getByRole("button", { name: "Saving..." })).toBeVisible();

        await expect(page.locator("text=An error occurred while saving.")).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole("button", { name: "Save Changes" })).toBeVisible();

        // Ensure we didn't redirect.
        expect(page.url()).toContain(`/settings/${encodeURIComponent(projectName)}`);
    });
});
