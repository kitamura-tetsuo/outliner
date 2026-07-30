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
        await TestHelpers.seedProjectAndNavigate(page, testInfo);
    });

    test("display diff and revert", async ({ page }) => {
        // Wait for store to be populated
        await page.waitForFunction(() => (globalThis as any).__YJS_STORE__?.isConnected, { timeout: 30000 }).catch(
            () => {},
        );

        await page.waitForFunction(() => {
            const gs = (globalThis as any).generalStore;
            return gs && gs.currentPage;
        }, { timeout: 30000 });

        const projectData = await page.evaluate(() => {
            const gs = (globalThis as any).generalStore;
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
                const gs = (globalThis as any).generalStore;
                const page = gs.currentPage;
                if (page) {
                    const node = page.items.addNode("user");
                    node.updateText("second");
                }

                (globalThis as any).__SNAPSHOT_SERVICE__.addSnapshot(
                    projectName,
                    pageName,
                    "- first",
                    "user",
                );
            },
            { projectName, pageName },
        );
        await page.goto(`/${projectName}/${pageName}/diff`);

        // Wait for the diff page to load
        try {
            await page.waitForFunction(() => (globalThis as any).generalStore?.currentPage !== null, null, {
                timeout: 30000,
            });
        } catch {
            console.log("Warning: currentPage not set on diff page, continuing anyway");
        }

        await page.getByText("Add Snapshot").click();
        await page.waitForSelector(".bg-white.rounded.shadow-lg li");

        const count = await page.evaluate(
            ({ projectName, pageName }) => {
                const { listSnapshots } = (globalThis as any).__SNAPSHOT_SERVICE__;
                return listSnapshots(projectName, pageName).length;
            },
            { projectName, pageName },
        );
        await expect(page.locator(".bg-white.rounded.shadow-lg li")).toHaveCount(count);

        await page.locator(".bg-white.rounded.shadow-lg li button").last().click();

        // Wait for the diff to be calculated and rendered
        await page.waitForFunction(() => {
            const diffElements = document.querySelectorAll(".diff");
            if (!diffElements || diffElements.length === 0) return false;
            for (let i = 0; i < diffElements.length; i++) {
                const html = diffElements[i].innerHTML;
                if (html.includes("<ins") || html.includes("<del")) {
                    return true;
                }
            }
            return false;
        }, { timeout: 10000 });

        await expect(page.locator("ins, del").first()).toBeVisible();

        await page.getByText("Revert").click();

        // Wait for the change to be reflected in the modal (diff should disappear or update)
        // Since we reverted to "first", the current content is now "first", which matches the snapshot "first".
        // The diff view might say "No differences" or similar, or the inline diff will only contain "first" with no ins/del.
        await page.waitForFunction(() => {
            const diffElements = document.querySelectorAll(".diff");
            if (!diffElements || diffElements.length === 0) return true;
            for (let i = 0; i < diffElements.length; i++) {
                const html = diffElements[i].innerHTML;
                if (html.includes("<ins") || html.includes("<del")) {
                    return false;
                }
            }
            return true;
        }, { timeout: 10000 });
    });
});
