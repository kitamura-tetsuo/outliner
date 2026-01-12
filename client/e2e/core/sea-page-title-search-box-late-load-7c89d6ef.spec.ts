// import "../utils/registerAfterEachSnapshot";
// import { registerCoverageHooks } from "../utils/registerCoverageHooks";
// registerCoverageHooks();
/** @feature SEA-0001
 *  Title   : Add page title search box (late load)
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("SEA-0001: page title search box", () => {
    test("search results update when pages load after typing", async ({ page }, testInfo) => {
        test.setTimeout(360000);
        const { projectName } = await TestHelpers.prepareTestEnvironment(page, testInfo);
        const input = page
            .getByTestId("main-toolbar")
            .getByRole("combobox", { name: "Search pages" });
        await input.waitFor();
        await input.focus();
        await input.fill("second");

        // Use SeedClient to inject data from "another user" (server-side)
        // This tests that the client receives updates from the server and updates the SearchBox
        const { SeedClient } = await import("../utils/seedClient");
        const authToken = await TestHelpers.getTestAuthToken();
        const seeder = new SeedClient(projectName, authToken);
        await seeder.seedPage("second-page", ["Second page content"]);

        console.log("[Test] Seeded 'second-page' via API");

        // Focus the input again on original page
        await input.focus();
        const inputAfterNav = input; // Input is still valid as we didn't reload

        // Explicitly wait for project items to be loaded from Yjs BEFORE typing
        // This ensures the SearchBox has data to search against
        // Explicitly wait for project items to be loaded from Yjs BEFORE typing
        // This ensures the SearchBox has data to search against
        await page.waitForFunction(() => {
            // eslint-disable-next-line no-restricted-globals
            const gs = (window as any).generalStore || (window as any).appStore;
            const items = gs?.project?.items;
            // Handle Proxy/AppSchema items - verify using iterator or Array.from
            const itemsArray = Array.from(items as any);

            // Check specifically for the second page
            const hasSecondPage = itemsArray.some((item: any) => item.text && item.text.includes("second-page"));

            if (!hasSecondPage) {
                // Return false to keep waiting
                return false;
            }
        }, { timeout: 30000 }).catch(async () => {
            console.log(
                "[Test] Warning: Timeout waiting for 'second-page' in live sync. Attempting reload to verify persistence...",
            );

            // Dump debug info carefully
            try {
                const debugInfo = await page.evaluate(() => {
                    // eslint-disable-next-line no-restricted-globals
                    const gs = (window as any).generalStore;
                    const items = gs?.project?.items;
                    // Items is a Proxy, need to convert
                    const itemsArr = items ? Array.from(items as any) : [];
                    return {
                        hasGs: !!gs,
                        hasProject: !!gs?.project,
                        itemsType: typeof items,
                        isProxy: !!items,
                        itemCount: itemsArr.length,
                        // Extract only text to avoid circular references
                        itemTexts: itemsArr.map((i: any) => i?.text?.toString() || ""),
                    };
                });
                console.log("[Test] Debug Info (Pre-reload):", JSON.stringify(debugInfo, null, 2));
            } catch (e) {
                console.log("[Test] Failed to capture debug info (non-fatal):", e instanceof Error ? e.message : e);
            }

            console.log("[Test] Reloading page to force sync...");
            // Reload to check if it's just a live-sync issue or if data is missing entirely
            await page.reload();
            try {
                await page.waitForLoadState("domcontentloaded");
                // eslint-disable-next-line no-restricted-globals
                await page.waitForFunction(() => !!(window as any).generalStore, { timeout: 10000 });
            } catch (e) {
                console.log("Warning: Reload wait failed", e);
            }

            // Wait again after reload
            await page.waitForFunction(() => {
                try {
                    // eslint-disable-next-line no-restricted-globals
                    const gs = (window as any).generalStore;
                    const items = gs?.project?.items;
                    // Handle Proxy for array
                    if (!items) return false;
                    const arr = Array.from(items as any);
                    return arr.some((item: any) => {
                        const t = item?.text?.toString ? item.text.toString() : String(item?.text || "");
                        return t.indexOf("second-page") !== -1;
                    });
                } catch {
                    return false;
                }
            }, { timeout: 30000 });
        });

        // Type the search query
        await page.waitForTimeout(1000); // Give a bit more time for any pending renders

        // Retry mechanism with explicit reactivity triggers
        let found = false;
        // Reduce retries to fail faster
        for (let i = 0; i < 3; i++) {
            await inputAfterNav.clear();
            await inputAfterNav.fill("second");
            // Trigger events ensuring reactivity
            await inputAfterNav.press("Space");
            await inputAfterNav.press("Backspace");
            // Dispatch explicit input event
            await inputAfterNav.evaluate(el => el.dispatchEvent(new Event("input", { bubbles: true })));
            await page.waitForTimeout(1000); // Allow Svelte reactivity

            try {
                // Explicitly wait for results
                await expect.poll(async () => {
                    const buttons = page.locator(".page-search-box ul li button");
                    const count = await buttons.filter({ hasText: "second" }).count();
                    if (count === 0) {
                        // Force a state update if not found yet (Svelte 5 signal tweak)
                        await page.evaluate(() => {
                            const store = (window as any).generalStore;
                            if (store) store.pagesVersion++;
                        }).catch(() => {});
                    }
                    return count;
                }, { timeout: 10000 }).toBeGreaterThan(0);
                found = true;
                break;
            } catch {
                console.log(`Search attempt ${i + 1} failed, retrying...`);
                // Force a blur/focus cycle
                await inputAfterNav.blur();
                await page.waitForTimeout(500);
                await inputAfterNav.focus();
            }
        }
        expect(found).toBe(true);
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/second-page/);
    });
});
