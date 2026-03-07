import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature YJS-0001
 *  Title   : Retrieve and verify projects and pages with Yjs
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * YJS-0001: Project and page retrieval and verification (Yjs)
 *
 * In this test, we retrieve a project from the Yjs-based store and
 * verify that a page with a specified title can be created and searched.
 */
test.describe("YJS-0001: Project and page retrieval and verification", () => {
    const testPageTitle = `test-page-${Date.now()}`;

    test.beforeEach(async ({ page }, testInfo) => {
        // Use standard test environment initialization
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Yjs project exists and pages can be created and searched", async ({ page }) => {
        // Create a page in the project
        await page.evaluate((title) => {
            const gs: any = (window as any).generalStore;
            if (!gs?.project) throw new Error("generalStore.project not ready");
            const page = gs.project.addPage(title, "tester");
            // Add 1 child item
            page.items.addNode("tester").updateText("child");
        }, testPageTitle);

        // Verify that the page exists
        const found = await page.evaluate((title) => {
            const gs: any = (window as any).generalStore;
            const pages: any = gs?.project?.items;
            const len = pages?.length ?? 0;
            for (let i = 0; i < len; i++) {
                const it = pages.at ? pages.at(i) : pages[i];
                const t = it?.text?.toString?.() ?? String(it?.text ?? "");
                if (String(t).toLowerCase() === String(title).toLowerCase()) return true;
            }
            return false;
        }, testPageTitle);
        expect(found).toBe(true);
    });

    test("Search for empty title is not detected (expected undefined)", async ({ page }) => {
        const result = await page.evaluate(() => {
            const gs: any = (window as any).generalStore;
            const pages: any = gs?.project?.items;
            const len = pages?.length ?? 0;
            for (let i = 0; i < len; i++) {
                const it = pages.at ? pages.at(i) : pages[i];
                const t = it?.text?.toString?.() ?? String(it?.text ?? "");
                if (String(t).trim() === "") return it;
            }
            return undefined;
        });
        // Judgment assuming there is no page with an empty title
        expect(result).toBeUndefined();
    });

    test("Non-existent title is not found", async ({ page }) => {
        const result = await page.evaluate(() => {
            const title = "__not_exists__";
            const gs: any = (window as any).generalStore;
            const pages: any = gs?.project?.items;
            const len = pages?.length ?? 0;
            for (let i = 0; i < len; i++) {
                const it = pages.at ? pages.at(i) : pages[i];
                const t = it?.text?.toString?.() ?? String(it?.text ?? "");
                if (String(t).toLowerCase() === title) return it;
            }
            return undefined;
        });
        expect(result).toBeUndefined();
    });

    test("Project data can be accessed from generalStore", async ({ page }) => {
        const info = await page.evaluate(async () => {
            const gs: any = (window as any).generalStore;
            // Wait for items to be populated
            const start = Date.now();
            while (Date.now() - start < 10000) {
                if (gs?.project?.items?.length > 0) break;
                await new Promise(r => setTimeout(r, 100));
            }
            const pages: any = gs?.project?.items;
            const len = pages?.length ?? 0;
            const titles: string[] = [];
            for (let i = 0; i < len; i++) {
                const it = pages.at ? pages.at(i) : pages[i];
                const t = it?.text?.toString?.() ?? String(it?.text ?? "");
                titles.push(t);
            }
            return { hasProject: !!gs?.project, pageCount: len, titles };
        });
        expect(info.hasProject).toBe(true);
        expect(info.pageCount).toBeGreaterThan(0);
    });
});
