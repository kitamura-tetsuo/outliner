import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/**
 * @file container-title-persistence.spec.ts
 * @description E2E tests for container title persistence and home dropdown display
 * Verifies that the container title is persisted in metaDoc and displayed in the home dropdown even after page reload
 */
import { expect, type Page, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

// Mirrors stableIdFromTitle in client/src/lib/yjsService.svelte.ts: the seed API
// derives a project's ID from its title, and the home selector is driven by IDs.
function stableIdFromTitle(title: string): string {
    let h = 2166136261 >>> 0; // FNV-1a basis
    for (let i = 0; i < title.length; i++) {
        h ^= title.charCodeAt(i);
        h = (h * 16777619) >>> 0;
    }
    return `p${h.toString(16)}`;
}

/** Option labels currently rendered by the home page project selector. */
async function selectorOptions(page: Page): Promise<string[]> {
    const selector = page.locator("select.project-select");
    await expect(selector).toBeVisible();
    return await selector.locator("option").allInnerTexts();
}

/**
 * @feature CNT-0001
 *  Title   : Container title persistence and home dropdown display
 *  Source  : docs/client-features.yaml
 */
test.describe("Container Title Persistence Tests", () => {
    /**
     * @testcase Displayed in home dropdown after container creation
     * @description Verify that the container name is displayed in the home dropdown immediately after creating a new container
     */
    test("Displayed in home dropdown after container creation", async ({ page }, testInfo) => {
        // Visiting the project page is what writes the title into the local metaDoc.
        const { projectName } = await TestHelpers.seedProjectAndNavigate(page, testInfo);
        const projectId = stableIdFromTitle(projectName);

        await page.goto("/", { waitUntil: "domcontentloaded" });
        await TestHelpers.setAccessibleProjects(page, [projectId]);

        await expect(async () => {
            const options = await selectorOptions(page);
            expect(
                options.some(opt => opt.includes(projectName)),
                `Expected "${projectName}" in selector options. Found: ${options.join(", ")}`,
            ).toBe(true);
        }).toPass({ timeout: 30000 });
    });

    /**
     * @testcase Container title is persisted in metaDoc
     * @description Verify that setting a title for a container persists it in metaDoc
     */
    test("Container title is persisted in metaDoc", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo);

        // Create project and page
        const { projectName, pageName } = await TestHelpers.seedProjectAndNavigate(page, testInfo);
        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);

        // Navigate to project page
        await page.goto(`/${encodedProject}/${encodedPage}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        // Set container title in metaDoc (call setContainerTitleInMetaDoc)
        await page.evaluate((projectName) => {
            // Call metaDoc module function to set title
            const metaDocModule = (globalThis as unknown as {
                __META_DOC_MODULE__?: {
                    setContainerTitleInMetaDoc: (project: string, title: string) => void;
                    getContainerTitleFromMetaDoc: (project: string) => string | null;
                };
            }).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.setContainerTitleInMetaDoc) {
                metaDocModule.setContainerTitleInMetaDoc(projectName, "Custom Container Title");
            }
        }, projectName);

        // Verify that the title is set in metaDoc
        const storedTitle = await page.evaluate((projectName) => {
            const metaDocModule = (globalThis as unknown as {
                __META_DOC_MODULE__?: {
                    setContainerTitleInMetaDoc: (project: string, title: string) => void;
                    getContainerTitleFromMetaDoc: (project: string) => string | null;
                };
            }).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
                return metaDocModule.getContainerTitleFromMetaDoc(projectName);
            }
            return null;
        }, projectName);

        expect(storedTitle).toBe("Custom Container Title");
    });

    /**
     * @testcase Container is displayed in home dropdown after page reload
     * @description Create a container, move to home, reload page, and verify container is still displayed
     */
    test("Container is displayed in home dropdown after page reload", async ({ page }, testInfo) => {
        const { projectName } = await TestHelpers.seedProjectAndNavigate(page, testInfo);
        const projectId = stableIdFromTitle(projectName);

        await page.goto("/", { waitUntil: "domcontentloaded" });
        await TestHelpers.setAccessibleProjects(page, [projectId]);

        await expect(async () => {
            const options = await selectorOptions(page);
            expect(options.some(opt => opt.includes(projectName))).toBe(true);
        }).toPass({ timeout: 30000 });

        // The title lives in a local-only metaDoc, so it must survive a reload.
        await page.reload({ waitUntil: "domcontentloaded" });
        await TestHelpers.setAccessibleProjects(page, [projectId]);

        await expect(async () => {
            const options = await selectorOptions(page);
            expect(
                options.some(opt => opt.includes(projectName)),
                `Expected "${projectName}" to survive reload. Found: ${options.join(", ")}`,
            ).toBe(true);
        }).toPass({ timeout: 30000 });
    });

    /**
     * @testcase Container title is preserved after reload
     * @description Set a title for a container and verify it is preserved after page reload
     */
    test("Container title is preserved after reload", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo);

        // Create project and page
        const { projectName, pageName } = await TestHelpers.seedProjectAndNavigate(page, testInfo);
        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);

        // Navigate to project page
        await page.goto(`/${encodedProject}/${encodedPage}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        // Set custom title in metaDoc
        await page.evaluate((projectName) => {
            const metaDocModule = (globalThis as unknown as {
                __META_DOC_MODULE__?: {
                    setContainerTitleInMetaDoc: (project: string, title: string) => void;
                    getContainerTitleFromMetaDoc: (project: string) => string | null;
                };
            }).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.setContainerTitleInMetaDoc) {
                metaDocModule.setContainerTitleInMetaDoc(projectName, "Reload Persistence Test Title");
            }
        }, projectName);

        // Verify set title can be retrieved
        let storedTitle = await page.evaluate((projectName) => {
            const metaDocModule = (globalThis as unknown as {
                __META_DOC_MODULE__?: {
                    setContainerTitleInMetaDoc: (project: string, title: string) => void;
                    getContainerTitleFromMetaDoc: (project: string) => string | null;
                };
            }).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
                return metaDocModule.getContainerTitleFromMetaDoc(projectName);
            }
            return null;
        }, projectName);

        expect(storedTitle).toBe("Reload Persistence Test Title");

        // Reload page
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(3000); // Wait for IndexedDB loading

        // Verify title is preserved after reload
        storedTitle = await page.evaluate((projectName) => {
            const metaDocModule = (globalThis as unknown as {
                __META_DOC_MODULE__?: {
                    setContainerTitleInMetaDoc: (project: string, title: string) => void;
                    getContainerTitleFromMetaDoc: (project: string) => string | null;
                };
            }).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
                return metaDocModule.getContainerTitleFromMetaDoc(projectName);
            }
            return null;
        }, projectName);

        expect(storedTitle).toBe("Reload Persistence Test Title");
    });

    /**
     * @testcase Container ID is displayed if title is unavailable (fallback)
     * @description Verify that container ID is displayed instead when no title is set for the container
     */
    test("Container ID is displayed if title is unavailable (fallback)", async ({ page }, testInfo) => {
        // Seed and visit a real project so the home page has an authenticated session,
        // then make a *second*, never-visited project accessible. Nothing has written a
        // title for it into the metaDoc, so the selector must fall back to its raw ID.
        await TestHelpers.seedProjectAndNavigate(page, testInfo);

        const untitledId = `p${Date.now().toString(16)}`;

        await page.goto("/", { waitUntil: "domcontentloaded" });
        await TestHelpers.setAccessibleProjects(page, [untitledId]);

        await expect(async () => {
            const options = await selectorOptions(page);
            expect(
                options.some(opt => opt.includes(untitledId)),
                `Expected fallback to raw ID "${untitledId}". Found: ${options.join(", ")}`,
            ).toBe(true);
        }).toPass({ timeout: 30000 });
    });

    /**
     * @testcase Updating title in metaDoc changes home dropdown label
     * @description Verify that updating container title in metaDoc also updates the home dropdown label
     */
    test("Updating title in metaDoc changes home dropdown label", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo);

        // Create project and page
        const { projectName, pageName } = await TestHelpers.seedProjectAndNavigate(page, testInfo);
        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);

        // Navigate to project page
        await page.goto(`/${encodedProject}/${encodedPage}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        // Set initial title
        await page.evaluate((projectName) => {
            const metaDocModule = (globalThis as unknown as {
                __META_DOC_MODULE__?: {
                    setContainerTitleInMetaDoc: (project: string, title: string) => void;
                    getContainerTitleFromMetaDoc: (project: string) => string | null;
                };
            }).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.setContainerTitleInMetaDoc) {
                metaDocModule.setContainerTitleInMetaDoc(projectName, "Initial Title");
            }
        }, projectName);

        // Verify initial title is set
        let storedTitle = await page.evaluate((projectName) => {
            const metaDocModule = (globalThis as unknown as {
                __META_DOC_MODULE__?: {
                    setContainerTitleInMetaDoc: (project: string, title: string) => void;
                    getContainerTitleFromMetaDoc: (project: string) => string | null;
                };
            }).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
                return metaDocModule.getContainerTitleFromMetaDoc(projectName);
            }
            return null;
        }, projectName);
        expect(storedTitle).toBe("Initial Title");

        // Update title
        await page.evaluate((projectName) => {
            const metaDocModule = (globalThis as unknown as {
                __META_DOC_MODULE__?: {
                    setContainerTitleInMetaDoc: (project: string, title: string) => void;
                    getContainerTitleFromMetaDoc: (project: string) => string | null;
                };
            }).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.setContainerTitleInMetaDoc) {
                metaDocModule.setContainerTitleInMetaDoc(projectName, "Updated Title");
            }
        }, projectName);

        // Verify updated title is reflected
        storedTitle = await page.evaluate((projectName) => {
            const metaDocModule = (globalThis as unknown as {
                __META_DOC_MODULE__?: {
                    setContainerTitleInMetaDoc: (project: string, title: string) => void;
                    getContainerTitleFromMetaDoc: (project: string) => string | null;
                };
            }).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
                return metaDocModule.getContainerTitleFromMetaDoc(projectName);
            }
            return null;
        }, projectName);
        expect(storedTitle).toBe("Updated Title");
    });

    /**
     * @testcase Title persistence works independently for multiple containers
     * @description Create multiple containers and verify that title persistence works independently for each
     */
    test("Title persistence works independently for multiple containers", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo);

        // Create project and page (Container 1)
        const { projectName: projectName1, pageName: pageName1 } = await TestHelpers.seedProjectAndNavigate(
            page,
            testInfo,
        );
        const encodedProject1 = encodeURIComponent(projectName1);
        const encodedPage1 = encodeURIComponent(pageName1);

        // Navigate to project page 1
        await page.goto(`/${encodedProject1}/${encodedPage1}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        // Set title for Container 1
        await page.evaluate((projectName) => {
            const metaDocModule = (globalThis as unknown as {
                __META_DOC_MODULE__?: {
                    setContainerTitleInMetaDoc: (project: string, title: string) => void;
                    getContainerTitleFromMetaDoc: (project: string) => string | null;
                };
            }).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.setContainerTitleInMetaDoc) {
                metaDocModule.setContainerTitleInMetaDoc(projectName, "Container 1 Title");
            }
        }, projectName1);

        // Verify Container 1 title is set
        let storedTitle1 = await page.evaluate((projectName) => {
            const metaDocModule = (globalThis as unknown as {
                __META_DOC_MODULE__?: {
                    setContainerTitleInMetaDoc: (project: string, title: string) => void;
                    getContainerTitleFromMetaDoc: (project: string) => string | null;
                };
            }).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
                return metaDocModule.getContainerTitleFromMetaDoc(projectName);
            }
            return null;
        }, projectName1);
        expect(storedTitle1).toBe("Container 1 Title");

        // Create Container 2
        const projectName2 = `TestProject2-${Date.now()}`;
        const pageName2 = `page-${Date.now()}`;
        await TestHelpers.seedProjectDataOnly(page, null, [], { projectName: projectName2, pageName: pageName2 });

        const encodedProject2 = encodeURIComponent(projectName2);
        const encodedPage2 = encodeURIComponent(pageName2);

        // Navigate to project page 2
        await page.goto(`/${encodedProject2}/${encodedPage2}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        // Set title for Container 2
        await page.evaluate((projectName) => {
            const metaDocModule = (globalThis as unknown as {
                __META_DOC_MODULE__?: {
                    setContainerTitleInMetaDoc: (project: string, title: string) => void;
                    getContainerTitleFromMetaDoc: (project: string) => string | null;
                };
            }).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.setContainerTitleInMetaDoc) {
                metaDocModule.setContainerTitleInMetaDoc(projectName, "Container 2 Title");
            }
        }, projectName2);

        // Verify Container 2 title is set
        const storedTitle2 = await page.evaluate((projectName) => {
            const metaDocModule = (globalThis as unknown as {
                __META_DOC_MODULE__?: {
                    setContainerTitleInMetaDoc: (project: string, title: string) => void;
                    getContainerTitleFromMetaDoc: (project: string) => string | null;
                };
            }).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
                return metaDocModule.getContainerTitleFromMetaDoc(projectName);
            }
            return null;
        }, projectName2);
        expect(storedTitle2).toBe("Container 2 Title");

        // Verify Container 1 title is unaffected
        storedTitle1 = await page.evaluate((projectName) => {
            const metaDocModule = (globalThis as unknown as {
                __META_DOC_MODULE__?: {
                    setContainerTitleInMetaDoc: (project: string, title: string) => void;
                    getContainerTitleFromMetaDoc: (project: string) => string | null;
                };
            }).__META_DOC_MODULE__;
            if (metaDocModule && metaDocModule.getContainerTitleFromMetaDoc) {
                return metaDocModule.getContainerTitleFromMetaDoc(projectName);
            }
            return null;
        }, projectName1);
        expect(storedTitle1).toBe("Container 1 Title");
    });
});
