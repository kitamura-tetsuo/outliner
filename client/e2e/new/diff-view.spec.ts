import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
// @ts-nocheck
/** @feature HDV-0001
 *  Title   : Page snapshot diff viewer
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("snapshot diff viewer", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("display diff and revert", async ({ page }) => {
        // Get project/page names from beforeEach's setup to avoid creating a new project
        // Wait for store to be populated
        // Wait for store to be populated
        // Ensure Yjs is connected first to avoid premature store checks
        // eslint-disable-next-line no-restricted-globals
        await page.waitForFunction(() => (window as any).__YJS_STORE__?.isConnected, { timeout: 30000 }).catch(
            () => {},
        );

        await page.waitForFunction(() => {
            // eslint-disable-next-line no-restricted-globals
            const gs = (window as any).generalStore;
            return gs && gs.currentPage;
        }, { timeout: 30000 });

        const projectData = await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-globals
            const gs = (window as any).generalStore;
            return {
                projectName: gs?.project?.title || gs?.project?.text || "",
                pageName: gs?.currentPage?.text || gs?.currentPage?.title || "",
                hasProject: !!gs?.project,
                hasCurrentPage: !!gs?.currentPage,
            };
        });
        console.log("Project data from store:", projectData);
        const { projectName, pageName } = projectData;
        if (!projectName || !pageName) {
            throw new Error(`Failed to get project/page names from store: ${JSON.stringify(projectData)}`);
        }
        await page.evaluate(
            ({ projectName, pageName }) => {
                // eslint-disable-next-line no-restricted-globals
                (window as any).__SNAPSHOT_SERVICE__.setCurrentContent(
                    projectName,
                    pageName,
                    "second",
                );
                // eslint-disable-next-line no-restricted-globals
                (window as any).__SNAPSHOT_SERVICE__.addSnapshot(
                    projectName,
                    pageName,
                    "first",
                    "user",
                );
            },
            { projectName, pageName },
        );
        await page.goto(`/${projectName}/${pageName}/diff`);

        // Wait for the diff page to load without waiting for cursor (diff page may not have cursor)
        try {
            // eslint-disable-next-line no-restricted-globals
            await page.waitForFunction(() => (window as any).generalStore?.currentPage !== null, null, {
                timeout: 30000,
            });
        } catch {
            console.log("Warning: currentPage not set on diff page, continuing anyway");
        }

        // ページの状態をデバッグ
        const pageContent = await page.content();
        console.log("Page content length:", pageContent.length);

        const snapshotServiceExists = await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-globals
            return !!(window as any).__SNAPSHOT_SERVICE__;
        });
        console.log("Snapshot service exists:", snapshotServiceExists);

        // ページのパラメータを確認
        const pageParams = await page.evaluate(() => {
            return {
                // eslint-disable-next-line no-restricted-globals
                url: window.location.href,
                // eslint-disable-next-line no-restricted-globals
                pathname: window.location.pathname,
                // eslint-disable-next-line no-restricted-globals
                params: (window as any).$page?.params,
            };
        });
        console.log("Page params:", pageParams);

        // SnapshotDiffModalコンポーネントが存在するかを確認
        const modalExists = await page.locator(".p-4.bg-white.rounded.shadow-lg").count();
        console.log("SnapshotDiffModal exists:", modalExists);

        const addSnapshotButton = await page.locator('text="Add Snapshot"').count();
        console.log("Add Snapshot button count:", addSnapshotButton);

        if (addSnapshotButton === 0) {
            const allButtons = await page.locator("button").allTextContents();
            console.log("All buttons on page:", allButtons);

            // ページの主要な要素を確認
            const mainContent = await page.locator("main, body > div").first().innerHTML();
            console.log("Main content (first 500 chars):", mainContent.substring(0, 500));
        }

        await page.getByText("Add Snapshot").click();
        await page.waitForSelector(".bg-white.rounded.shadow-lg li");
        const count = await page.evaluate(
            ({ projectName, pageName }) => {
                // eslint-disable-next-line no-restricted-globals
                const { listSnapshots } = (window as any).__SNAPSHOT_SERVICE__;
                return listSnapshots(projectName, pageName).length;
            },
            { projectName, pageName },
        );
        await expect(page.locator(".bg-white.rounded.shadow-lg li")).toHaveCount(count);

        // Click the button inside the first list item to show the diff
        await page.locator(".bg-white.rounded.shadow-lg li button").first().click();

        // Wait for the diff to be calculated and rendered
        await page.waitForFunction(() => {
            const diffElement = document.querySelector(".diff");
            return diffElement && diffElement.innerHTML.trim().length > 0
                && (diffElement.innerHTML.includes("<ins") || diffElement.innerHTML.includes("<del"));
        }, { timeout: 10000 });

        // Verify that at least one diff element is visible
        await expect(page.locator("ins, del").first()).toBeVisible();
        await page.getByText("Revert").click();
        const current = await page.evaluate(
            ({ projectName, pageName }) => {
                // eslint-disable-next-line no-restricted-globals
                const { getCurrentContent } = (window as any).__SNAPSHOT_SERVICE__;
                return getCurrentContent(projectName, pageName);
            },
            { projectName, pageName },
        );
        expect(current).toBe("first");
    });
});
