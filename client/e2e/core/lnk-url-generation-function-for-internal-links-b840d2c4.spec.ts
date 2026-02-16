import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature LNK-0001
 *  Title   : Internal link URL generation function
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @file LNK-0001.spec.ts
 * @description Tests for internal link navigation features
 * Verifies that internal link URLs are generated correctly.
 * @playwright
 * @title Internal Link Navigation
 */

test.describe("LNK-0001: Internal Link Navigation", () => {
    test.beforeEach(async ({ page }) => {
        // Capture browser console output
        page.on("console", msg => {
            if (msg.type() === "log" || msg.type() === "error") {
                console.log(`Browser ${msg.type()}: ${msg.text()}`);
            }
        });
    });
    /**
     * @testcase Internal link URLs are generated correctly
     * @description Verifies that internal link URLs are generated correctly
     */
    /**
     * @testcase Text input is reflected correctly
     * @description Verifies that text input is reflected correctly
     */
    test("Text input is reflected correctly", async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [""]);
        // Wait for outliner items to appear (minimum 2: page title + first item)
        await TestHelpers.waitForItemCount(page, 2, 30000);

        // Debug: Check item count
        const itemCount = await page.locator(".outliner-item").count();
        console.log("Total outliner items:", itemCount);

        // Debug: Check existence of each item
        for (let i = 0; i < itemCount; i++) {
            const item = page.locator(".outliner-item").nth(i);
            const exists = await item.count();
            console.log(`Item ${i} exists:`, exists);
            if (exists > 0) {
                const itemHTML = await item.innerHTML();
                console.log(`Item ${i} HTML:`, itemHTML.substring(0, 200));
            }
        }

        // Find the first editable item (usually the first item)
        const firstItem = page.locator(".outliner-item").nth(1);

        // First, get the item ID
        const firstItemId = await firstItem.getAttribute("data-item-id");
        console.log("First item ID:", firstItemId);

        // Get the actual page name (more reliable method)
        const actualPageName = await page.evaluate(() => {
            // First try to get from store
            // eslint-disable-next-line no-restricted-globals
            const store = (window as any).store;
            if (store && store.currentPage && store.currentPage.text) {
                return store.currentPage.text;
            }

            // Fallback: get from DOM
            const pageTitle = document.querySelector(".page-title-content .item-text");
            return pageTitle ? pageTitle.textContent?.trim() : "test-page";
        });
        console.log("Actual page name:", actualPageName);

        // Try text input using the conventional method
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("Control+a");
        await page.waitForTimeout(100);
        await page.keyboard.type(`[${actualPageName}]`);
        // Wait a bit for Yjs synchronization
        await page.waitForTimeout(1000);

        // Check if text input was successful
        console.log("Checking if text input was successful...");
        const inputSuccess = await page.evaluate(pageName => {
            const items = document.querySelectorAll(".outliner-item");
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const textContent = item.textContent || "";
                if (textContent.includes(`[${pageName}]`)) {
                    return { success: true, itemIndex: i, content: textContent };
                }
            }
            return { success: false, itemIndex: -1, content: "" };
        }, actualPageName);
        console.log("Text input result:", inputSuccess);

        if (!inputSuccess.success) {
            throw new Error(`Text input failed - [${actualPageName}] not found in any item`);
        }
    });

    /**
     * @testcase Internal link URLs are generated correctly
     * @description Verifies that internal link URLs are generated correctly
     */
    test("Internal link URLs are generated correctly", async ({ page }, testInfo) => {
        // Create test data including project internal links via API
        // Page name is auto-generated, so retrieve it later
        const { pageName: currentPageName } = await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "First line: Test",
            `[PLACEHOLDER_PAGE_NAME]`, // To be replaced later
            "[/project-name/page-name]", // This will be formatted as a project internal link
            "Third item",
            "Second line: Yjs reflection",
            "Third line: Order check",
        ]);

        // Verify that items are displayed
        await TestHelpers.waitForItemCount(page, 7, 30000); // Title + 6 seeded lines

        // Replace PLACEHOLDER with actual page name (after page name is determined in prepareTestEnvironment)
        await page.evaluate(() => {
            const items = document.querySelectorAll(".outliner-item");
            for (const item of items) {
                if (item.textContent?.includes("[PLACEHOLDER_PAGE_NAME]")) {
                    // const textEl = item.querySelector(".item-text");
                    // Simply rewriting DOM is not correct, better to use store or input,
                    // but here we simulate text replacement of already displayed items.
                    // Since Yjs update is needed, actually performing input operation is best,
                    // but for test stability, waiting for DOM manipulation + Yjs reflection or reseeding is better.
                    // Since prepareTestEnvironment's return value couldn't be used in this structure,
                    // there is a constraint that page name cannot be specified when seeding via API here.
                    // Therefore, we update the item text to match existing logic.

                    // However, prepareTestEnvironment returns the page name, so using that
                    // to execute an action to update the text of the 2nd line is reliable.
                }
            }
        }, { pageName: currentPageName });

        // NOTE: The replacement in evaluate above is incomplete,
        // so actually use updateText to update.
        await page.evaluate(({ pageName }) => {
            // eslint-disable-next-line no-restricted-globals
            const store = (window as any).generalStore || (window as any).appStore;
            const items = store?.currentPage?.items;
            if (!items) return;
            // Get the 2nd item (index 1)
            const targetItem = items.at ? items.at(1) : (items as any)[1];
            if (targetItem && typeof targetItem.updateText === "function") {
                targetItem.updateText(`[${pageName}]`);
            }
        }, { pageName: currentPageName });

        // We need to ensure the page is loaded and formatted, so wait a bit
        await page.waitForTimeout(1000);

        // Blur focus so that internal links are displayed correctly
        await page.evaluate(() => {
            const activeElement = document.activeElement;
            if (activeElement && activeElement.tagName === "TEXTAREA") {
                (activeElement as HTMLElement).blur();
            }
        });
        await page.waitForTimeout(500);

        const actualPageName = currentPageName;

        // Test ScrapboxFormatter behavior
        const formatterTest = await page.evaluate(pageName => {
            // Check if ScrapboxFormatter is available
            // eslint-disable-next-line no-restricted-globals
            if (typeof window.ScrapboxFormatter === "undefined") {
                return { error: "ScrapboxFormatter not available" };
            }

            const testText = `[${pageName}]`;
            // eslint-disable-next-line no-restricted-globals
            const result = window.ScrapboxFormatter.formatToHtml(testText);

            return {
                input: testText,
                output: result,
                hasInternalLink: result.includes("internal-link"),
                hasHref: result.includes("href="),
            };
        }, actualPageName);
        console.log("ScrapboxFormatter test result:", formatterTest);

        // Test project internal link
        const projectLinkTestResult = await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-globals
            if (typeof window.ScrapboxFormatter === "undefined") {
                return { error: "ScrapboxFormatter not available" };
            }

            const testText = `[/project-name/page-name]`;
            // eslint-disable-next-line no-restricted-globals
            const result = window.ScrapboxFormatter.formatToHtml(testText);

            return {
                input: testText,
                output: result,
                hasInternalLink: result.includes("internal-link"),
                hasProjectLink: result.includes("project-link"),
                hasHref: result.includes("href="),
            };
        });
        console.log("Project link test result:", projectLinkTestResult);

        // Verify links
        console.log("Checking for internal links...");

        // First, check the number of elements
        const currentItemCount = await page.locator(".outliner-item").count();
        console.log("Current item count:", currentItemCount);

        const linkCheckResult = [];

        // Process each item individually
        for (let i = 0; i < currentItemCount; i++) {
            const item = page.locator(".outliner-item").nth(i);

            try {
                const textContent = await item.textContent({ timeout: 5000 }) || "";
                const itemTextCount = await item.locator(".item-text").count();
                let itemTextHTML = "";

                if (itemTextCount > 0) {
                    try {
                        itemTextHTML = await item.locator(".item-text").innerHTML({ timeout: 5000 });
                    } catch (error) {
                        console.log(`Failed to get .item-text HTML for item ${i}:`, error);
                    }
                }

                const result = {
                    index: i,
                    textContent: textContent.substring(0, 100),
                    hasItemText: itemTextCount > 0,
                    itemTextHTML: itemTextHTML, // Keep full HTML
                    hasTestPageText: textContent.includes(`[${actualPageName}]`)
                        || textContent.includes(actualPageName),
                    hasProjectPageText: textContent.includes("[/project-name/page-name]")
                        || textContent.includes("project-name/page-name"),
                    hasInternalLink: itemTextHTML.includes("internal-link"),
                    hasHref: itemTextHTML.includes("href="),
                };

                console.log(`Item ${i}:`, result);
                linkCheckResult.push(result);
            } catch (error) {
                console.log(`Failed to process item ${i}:`, error);
                linkCheckResult.push({
                    index: i,
                    textContent: "Failed to get content",
                    hasItemText: false,
                    itemTextHTML: "",
                    hasTestPageText: false,
                    hasProjectPageText: false,
                    hasInternalLink: false,
                    hasHref: false,
                });
            }
        }

        console.log("Link check results:", JSON.stringify(linkCheckResult, null, 2));

        // Verify item with correctly generated internal link
        const currentUrl = page.url();
        const urlParts = new URL(currentUrl).pathname.split("/").filter(Boolean);
        const projectNameEncoded = urlParts[0];

        const linkItemResult = linkCheckResult.find(r => r.hasTestPageText && r.hasInternalLink);
        if (linkItemResult) {
            console.log("Found item with internal link:", linkItemResult);
            expect(linkItemResult.itemTextHTML).toContain("internal-link");
            expect(linkItemResult.itemTextHTML).toContain(actualPageName);
            expect(linkItemResult.itemTextHTML).toContain(`href="/${projectNameEncoded}/${actualPageName}"`);
        } else {
            // If internal link not found, show details
            const itemsWithTestPage = linkCheckResult.filter(r => r.hasTestPageText);
            console.log("Items with test page text but no internal link:", itemsWithTestPage);
            // Fail here if not found, or let next assertion fail
            // Failing here
            // throw new Error(`No item found with internal link for [${actualPageName}]`);
            // NOTE: Link generation may be delayed asynchronously, so fail here
            expect(linkItemResult, `No internal link found for [${actualPageName}]`).toBeDefined();
        }

        // Verify internal link is correctly generated in the 2nd item
        // Check HTML element to verify project internal link is correctly generated
        const projectLinkExists = await page.evaluate(() => {
            // Search whole page to check if link with href="/project-name/page-name" exists
            const links = document.querySelectorAll("a.internal-link");
            for (const link of links) {
                if (
                    link.getAttribute("href") === "/project-name/page-name"
                    && link.textContent?.includes("project-name/page-name")
                ) {
                    return true;
                }
            }
            return false;
        });

        if (projectLinkExists) {
            console.log("Found project internal link with href='/project-name/page-name'");
        } else {
            throw new Error("No project internal link found with href='/project-name/page-name'");
        }
    });

    /**
     * @testcase Internal link HTML is generated correctly
     * @description Verifies that internal link HTML is generated correctly
     */
    test("Internal link HTML is generated correctly", async ({ page }, testInfo) => {
        const { pageName } = await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "[placeholder]",
            "[/project-name/page-name]",
            "Third item",
        ]);

        await TestHelpers.waitForItemCount(page, 4, 30000); // Title + 3 seeded lines

        await page.evaluate(dynamicPageName => {
            // eslint-disable-next-line no-restricted-globals
            const store = (window as any).generalStore || (window as any).appStore;
            const items = store?.currentPage?.items;
            if (!items) return;
            const firstItem = items.at ? items.at(0) : (items as any)[0];
            if (firstItem && typeof firstItem.updateText === "function") {
                firstItem.updateText(`[${dynamicPageName}]`);
            }
        }, pageName);

        await page.waitForTimeout(500);
        await page.locator("body").click({ position: { x: 5, y: 5 } });
        await page.waitForTimeout(500);

        const internalLink = page.locator(".item-text a.internal-link").filter({ hasText: pageName }).first();
        await expect(internalLink).toBeVisible({ timeout: 5000 });

        const currentUrl = page.url();
        const urlParts = new URL(currentUrl).pathname.split("/").filter(Boolean);
        const projectNameEncoded = urlParts[0];

        await expect(internalLink).toHaveAttribute("href", `/${projectNameEncoded}/${pageName}`);

        const internalLinkParentClass = await internalLink.evaluate(node => node.parentElement?.className ?? "");
        expect(internalLinkParentClass).toContain("link-preview-wrapper");

        const projectLink = page.locator('a.internal-link.project-link[href="/project-name/page-name"]');
        await expect(projectLink).toBeVisible({ timeout: 5000 });
        await expect(projectLink).toHaveText("project-name/page-name");

        const projectLinkClass = await projectLink.getAttribute("class");
        expect(projectLinkClass).toContain("internal-link");
        expect(projectLinkClass).toContain("project-link");

        const projectLinkDataset = await projectLink.evaluate(node => ({
            project: node.getAttribute("data-project"),
            page: node.getAttribute("data-page"),
        }));
        expect(projectLinkDataset.project).toBe("project-name");
        expect(projectLinkDataset.page).toBe("page-name");
    });
});
