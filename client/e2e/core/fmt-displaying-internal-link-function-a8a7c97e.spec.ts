import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FMT-0007
 *  Title   : Display of Internal Link Function
 *  Source  : docs/client-features.yaml
 */
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

/**
 * @file FMT-0007.spec.ts
 * @description Tests for internal link function
 * Tests the display and functionality of internal links.
 * @playwright
 * @title Internal Link Functionality
 */

test.describe("FMT-0007: Internal Link Functionality", () => {
    const ensureOutlinerReady = async (page: Page, timeout = 30000): Promise<void> => {
        try {
            await TestHelpers.waitForOutlinerItems(page, 1, timeout);
            return;
        } catch (error) {
            console.warn("waitForOutlinerItems fallback", error instanceof Error ? error.message : error);
        }

        await page.waitForFunction(() => {
            const gs = (window as any).generalStore || (window as any).appStore;
            return !!(gs?.currentPage?.items);
        }, { timeout });

        const hasOutliner = await page.locator(".outliner-item").count();
        expect(hasOutliner, "expected at least one outliner item in fallback").toBeGreaterThan(0);
    };

    const createBlankItem = async (page: Page): Promise<string> => {
        // Ensure the app is fully loaded and items are partially visible before accessing the store
        await TestHelpers.waitForOutlinerItems(page);

        // Double check store availability just in case
        await page.waitForFunction(() => {
            const gs = (window as any).generalStore || (window as any).appStore;
            return !!(gs?.currentPage?.items);
        }, { timeout: 30000 });
        await page.evaluate(() => {
            const gs = (window as any).generalStore || (window as any).appStore;
            const items = gs?.currentPage?.items;
            if (items && typeof items.addNode === "function") {
                const newItem = items.addNode("tester");
                if (newItem && typeof newItem.updateText === "function") {
                    newItem.updateText("");
                }
            }
        });
        await page.waitForTimeout(200);
        const itemId = await page.evaluate(() => {
            const gs = (window as any).generalStore || (window as any).appStore;
            const items = gs?.currentPage?.items;
            if (!items) return null;
            const length = typeof items.length === "number" ? items.length : 0;
            if (length === 0) return null;
            const lastItem = typeof items.at === "function"
                ? items.at(length - 1)
                : (items as any)[length - 1];
            return lastItem?.id ?? null;
        });
        expect(itemId, "expected a blank outliner item id").toBeTruthy();
        const id = itemId as string;
        await page.locator(`.outliner-item[data-item-id="${id}"]`).waitFor({ state: "visible", timeout: 5000 });
        return id;
    };

    const setItemText = async (page: Page, itemId: string, text: string): Promise<void> => {
        await page.evaluate(({ itemId, text }) => {
            const gs = (window as any).generalStore || (window as any).appStore;
            const items = gs?.currentPage?.items;
            if (!items) return;
            const length = typeof items.length === "number" ? items.length : items?.getLength?.();
            if (typeof length !== "number") return;
            for (let i = 0; i < length; i++) {
                const node = items.at ? items.at(i) : (items as any)[i];
                if (node?.id === itemId) {
                    if (typeof node.updateText === "function") {
                        node.updateText(text);
                    }
                    break;
                }
            }
        }, { itemId, text });
        await page.waitForTimeout(150);
    };

    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    /**
     * @testcase Standard internal link syntax is displayed correctly
     * @description Test to confirm that internal links in [page-name] format are displayed correctly
     */
    test("Standard internal link syntax is displayed correctly", async ({ page }) => {
        // Setup test page
        await ensureOutlinerReady(page);

        // Select the first item
        const firstItemId = await createBlankItem(page);
        const firstItem = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // Enter internal link text
        await page.keyboard.type("[test-page]");

        // Programmatically create and focus the second item
        const secondItemId = await createBlankItem(page);
        const secondItem = page.locator(`.outliner-item[data-item-id="${secondItemId}"]`);
        await secondItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.type("Another item");

        // Create the third item and move cursor
        const thirdItemId = await createBlankItem(page);
        const thirdItem = page.locator(`.outliner-item[data-item-id="${thirdItemId}"]`);
        await thirdItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.type("Third item");

        // Explicitly unfocus to stabilize rendering
        await page.locator("body").click({ position: { x: 5, y: 5 } });
        await page.waitForTimeout(500);
        await page.waitForFunction(
            (itemId) => {
                const store = (window as any).editorOverlayStore;
                return store && store.getActiveItem && store.getActiveItem() !== itemId;
            },
            firstItemId,
            { timeout: 5000 },
        );
        await expect(firstItem.locator(".item-text .internal-link")).toBeVisible({ timeout: 5000 });

        // Check the text content of the first item (internal link should be applied)
        const firstItemText = await firstItem.locator(".item-text").innerHTML();

        // Verify that the internal link is applied
        const currentUrl = page.url();
        const urlParts = new URL(currentUrl).pathname.split("/").filter(Boolean);
        const projectNameEncoded = urlParts[0];

        expect(firstItemText).toContain("internal-link");
        expect(firstItemText).toContain("test-page");
        expect(firstItemText).toContain(`href="/${projectNameEncoded}/test-page"`);
    });

    /**
     * @testcase Project internal link syntax is displayed correctly
     * @description Test to confirm that internal links in [/project-name/page-name] format are displayed correctly
     */
    test("Project internal link syntax is displayed correctly", async ({ page }) => {
        // Setup test page
        await ensureOutlinerReady(page);

        // Select the first item
        const firstItemId = await createBlankItem(page);
        const firstItem = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);
        await setItemText(page, firstItemId, "[/project-name/page-name]");

        const secondItemId = await createBlankItem(page);
        await setItemText(page, secondItemId, "Another item");

        const thirdItemId = await createBlankItem(page);
        await setItemText(page, thirdItemId, "Third item");

        await page.locator("body").click({ position: { x: 5, y: 5 } });
        await page.waitForTimeout(500);
        await page.waitForFunction(
            (itemId) => {
                const store = (window as any).editorOverlayStore;
                return store && store.getActiveItem && store.getActiveItem() !== itemId;
            },
            firstItemId,
            { timeout: 5000 },
        );
        await expect(firstItem.locator(".item-text .internal-link")).toBeVisible({ timeout: 5000 });
        await expect(firstItem.locator(".item-text .project-link")).toBeVisible({ timeout: 5000 });

        // Check the text content of the first item (internal link should be applied)
        const firstItemText = await firstItem.locator(".item-text").innerHTML();

        // Verify that the internal link is applied
        expect(firstItemText).toContain("internal-link");
        expect(firstItemText).toContain("project-link");
        expect(firstItemText).toContain("project-name/page-name");
        expect(firstItemText).toContain('href="/project-name/page-name"');
    });

    /**
     * @testcase Internal links are displayed as plain text in items with cursor
     * @description Test to confirm that internal links are displayed as plain text in items with cursor
     */
    test("Internal links are displayed as plain text in items with cursor", async ({ page }) => {
        // Setup test page
        await ensureOutlinerReady(page);

        // Select the first item
        const firstItemId = await createBlankItem(page);
        const firstItem = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);
        await setItemText(page, firstItemId, "[test-page]");
        await TestHelpers.setCursor(page, firstItemId, 0, "local");
        await TestHelpers.waitForCursorVisible(page);

        const firstItemTextWithCursor = await firstItem.locator(".item-text").innerHTML();

        expect(firstItemTextWithCursor).toContain('class="control-char">[');
        expect(firstItemTextWithCursor).toContain('class="control-char">]');
        expect(firstItemTextWithCursor).not.toContain('href="/test-page"');

        const secondItemId = await createBlankItem(page);
        await setItemText(page, secondItemId, "Another item");
        await TestHelpers.setCursor(page, secondItemId, 0, "local");
        await TestHelpers.waitForCursorVisible(page);

        await page.waitForFunction(
            (itemId) => {
                const store = (window as any).editorOverlayStore;
                return store && store.getActiveItem && store.getActiveItem() !== itemId;
            },
            firstItemId,
            { timeout: 5000 },
        );

        // Check the text content of the first item (internal link should be applied)
        const firstItemTextWithoutCursor = await firstItem.locator(".item-text").innerHTML();

        // Verify that the internal link is applied
        const currentUrl = page.url();
        const urlParts = new URL(currentUrl).pathname.split("/").filter(Boolean);
        const projectNameEncoded = urlParts[0];

        expect(firstItemTextWithoutCursor).toContain("internal-link");
        expect(firstItemTextWithoutCursor).toContain("test-page");
        expect(firstItemTextWithoutCursor).toContain(`href="/${projectNameEncoded}/test-page"`);
    });

    /**
     * @testcase Internal link data is saved correctly
     * @description Test to confirm that internal link data is saved correctly
     */
    test("Internal link data is saved correctly", async ({ page }) => {
        // Select an item other than the page title (second item)
        await ensureOutlinerReady(page);
        const firstItemId = await createBlankItem(page);
        const firstItem = page.locator(`.outliner-item[data-item-id="${firstItemId}"]`);
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // Check cursor state and create if necessary
        const cursorState = await page.evaluate(() => {
            const editorStore = (window as any).editorOverlayStore;
            if (!editorStore) return { error: "editorOverlayStore not found" };

            const activeItem = editorStore.getActiveItem();
            const cursorInstances = editorStore.getCursorInstances();

            return {
                activeItem,
                cursorInstancesCount: cursorInstances.length,
            };
        });

        // Create cursor instance if it does not exist
        if (cursorState.cursorInstancesCount === 0) {
            await page.evaluate(() => {
                const editorStore = (window as any).editorOverlayStore;
                if (editorStore) {
                    const activeItemId = editorStore.getActiveItem();
                    if (activeItemId) {
                        editorStore.setCursor({
                            itemId: activeItemId,
                            offset: 0,
                            isActive: true,
                            userId: "local",
                        });
                    }
                }
            });
        }

        // Insert standard internal link using cursor.insertText()
        await page.evaluate(() => {
            const editorStore = (window as any).editorOverlayStore;
            if (editorStore) {
                const cursorInstances = editorStore.getCursorInstances();
                if (cursorInstances.length > 0) {
                    const cursor = cursorInstances[0];
                    // Clear existing text
                    const target = cursor.findTarget();
                    if (target) {
                        target.updateText("");
                        cursor.offset = 0;
                    }
                    // Insert standard internal link
                    cursor.insertText("[test-page]");
                }
            }
        });

        // Insert newline to create a new item
        await page.evaluate(() => {
            const editorStore = (window as any).editorOverlayStore;
            if (editorStore) {
                const cursorInstances = editorStore.getCursorInstances();
                if (cursorInstances.length > 0) {
                    const cursor = cursorInstances[0];
                    cursor.insertText("\n");
                }
            }
        });

        // Insert project internal link
        await page.evaluate(() => {
            const editorStore = (window as any).editorOverlayStore;
            if (editorStore) {
                const cursorInstances = editorStore.getCursorInstances();
                if (cursorInstances.length > 0) {
                    const cursor = cursorInstances[0];
                    cursor.insertText("[/project-name/page-name]");
                }
            }
        });

        // Wait a bit for data to be reflected
        await page.waitForTimeout(500);

        // Get SharedTree data (with fallback)
        const treeData = await TreeValidator.getTreeData(page);

        // Output debug info
        console.log("Tree data items:");
        treeData.items.forEach((item: any, index: number) => {
            console.log(`  Item ${index}: "${item.text}"`);
            if (item.items && item.items.length > 0) {
                item.items.forEach((subItem: any, subIndex: number) => {
                    console.log(`    SubItem ${subIndex}: "${subItem.text}"`);
                });
            }
        });

        // Verify data is saved correctly
        // Search for item containing both links from sub-items
        let linkItem = null;

        for (const item of treeData.items) {
            if (item.items) {
                // If items is an object (actual data structure)
                const itemsArray = Array.isArray(item.items) ? item.items : Object.values(item.items);
                for (const subItem of itemsArray) {
                    if (subItem.text.includes("[test-page]") && subItem.text.includes("[/project-name/page-name]")) {
                        linkItem = subItem;
                        break;
                    }
                }
            }
        }

        // Verify that an item containing both links is found
        expect(linkItem).not.toBeNull();
        expect(linkItem!.text).toContain("[test-page]");
        expect(linkItem!.text).toContain("[/project-name/page-name]");
    });
});
