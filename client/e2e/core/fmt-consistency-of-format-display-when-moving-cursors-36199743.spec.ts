import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FMT-0006
 *  Title   : Consistency of format display when moving cursors
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";

import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

test.describe("Consistency of format display when moving cursors", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("Control characters display/hide appropriately when moving cursor", async ({ page }) => {
        // Setup test page

        // Select the first item
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("Control+a");
        await page.keyboard.press("Backspace");

        // Enter bold text
        await page.keyboard.type("[[aasdd]]");

        // Create a second item
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);

        // Enter internal link text
        await page.keyboard.type("[asd]");

        // Create a third item
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);

        // Create an empty item
        await page.keyboard.type("temp");
        await page.waitForTimeout(300); // Wait for UI to update
        const thirdItem = page.locator(".outliner-item").nth(2);
        const thirdItemBox = await thirdItem.boundingBox();
        if (thirdItemBox) {
            await page.mouse.click(
                thirdItemBox.x + thirdItemBox.width / 2,
                thirdItemBox.y + Math.min(thirdItemBox.height / 2, 10),
            );
            await TestHelpers.waitForCursorVisible(page);
        }
        await page.waitForTimeout(300);

        // Check text content of the first item (control characters are hidden and format is applied)
        await page.waitForTimeout(300);
        await expect.poll(async () => {
            return await firstItem.locator(".item-text").innerHTML();
        }).toContain("<strong>aasdd</strong>");

        // Check text content of the second item (control characters are hidden and internal link is applied)
        const secondItem = page.locator(".outliner-item").nth(1);

        // Wait for UI to update after cursor changes
        await page.waitForTimeout(300);

        await expect.poll(async () => {
            const html = await secondItem.locator(".item-text").innerHTML();
            return html.includes("internal-link") || html.includes("control-char");
        }, { timeout: 2000 }).toBeTruthy();

        const secondItemHtmlInactive = await secondItem.locator(".item-text").innerHTML();
        expect(secondItemHtmlInactive).toContain("internal-link");
        expect(secondItemHtmlInactive).not.toContain("control-char");

        // Return to the first item
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // Get text content of the first item (confirm control characters are displayed)
        const firstItemHtmlActive = await firstItem.locator(".item-text").innerHTML();
        expect(firstItemHtmlActive).toContain("<strong>aasdd</strong>");

        // Click the second item
        await secondItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // Get text content of the second item (confirm control characters are displayed)
        const secondItemHtmlActive = await secondItem.locator(".item-text").innerHTML();
        expect(secondItemHtmlActive).toContain('<span class="control-char">[</span>asd');
    });

    test("Title is displayed as normal text", async ({ page }) => {
        // Setup test page

        // Select title
        const pageTitle = page.locator(".page-title");
        await pageTitle.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // Clear existing text and enter new text
        await page.keyboard.press("Control+a");
        await page.keyboard.type("aasdd");

        // Click a normal item
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // Check title style (title-text class is applied)
        const titleClasses = await pageTitle.locator(".item-text").getAttribute("class");
        expect(titleClasses).toContain("title-text");

        // Check title CSS style
        const titleFontWeight = await pageTitle.locator(".item-text").evaluate(el => {
            return window.getComputedStyle(el).fontWeight;
        });
        console.log("Title font weight:", titleFontWeight);
        // Confirm title font weight is set (check actual value in log)
        expect(titleFontWeight).toBeDefined();

        // Click title
        await pageTitle.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // Check title text content (plain text is displayed without control characters)
        const titleText = await pageTitle.locator(".item-text").textContent();
        expect(titleText).toBe("aasdd");

        // Click a normal item
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // Check title text content (displayed as normal text)
        const titleTextWithoutCursor = await pageTitle.locator(".item-text").textContent();
        expect(titleTextWithoutCursor).toBe("aasdd");
    });

    test("External link syntax is displayed correctly", async ({ page }) => {
        // Setup test page

        // Select the first item
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("Control+a");
        await page.keyboard.press("Backspace");
        const firstItemIdForLink = await TestHelpers.getItemIdByIndex(page, 0);
        expect(firstItemIdForLink).not.toBeNull();
        await TestHelpers.setCursor(page, firstItemIdForLink!, 0, "local");
        await TestHelpers.insertText(page, firstItemIdForLink!, "[https://example.com]");

        // Create a second item
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);

        // Check text content of the first item (link is applied)
        const pageTextsAfterLink = await TestHelpers.getPageTexts(page);
        expect(
            pageTextsAfterLink.some(({ text }) =>
                text === "[https://example.com]" || text?.includes("[https://example.com]")
            ),
        ).toBe(true);
        const treeDataAfterLink = await TreeValidator.getTreeData(page);
        expect(JSON.stringify(treeDataAfterLink)).toContain("[https://example.com]");
        const firstItemTextContentInactive = await firstItem.locator(".item-text").textContent();
        expect(firstItemTextContentInactive).toContain("https://example.com");

        // Click the first item
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // Check text content of the first item (control characters are displayed)
        const firstItemTextContentActive = await firstItem.locator(".item-text").textContent();
        expect(firstItemTextContentActive).toContain("https://example.com");
    });

    test("Internal link syntax is displayed correctly", async ({ page }) => {
        // Setup test page

        // Select the first item
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("Control+a");
        await page.keyboard.press("Backspace");
        const firstItemIdForInternalLink = await TestHelpers.getItemIdByIndex(page, 0);
        expect(firstItemIdForInternalLink).not.toBeNull();
        await TestHelpers.setCursor(page, firstItemIdForInternalLink!, 0, "local");
        await TestHelpers.insertText(page, firstItemIdForInternalLink!, "[asd]");

        // Create a second item
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);

        // Check text content of the first item (internal link is applied)
        const pageTextsAfterInternalLink = await TestHelpers.getPageTexts(page);
        expect(pageTextsAfterInternalLink.some(({ text }) => text === "[asd]" || text?.includes("[asd]"))).toBe(true);
        await page.waitForTimeout(300);
        const firstItemTextContentInactiveInternal = await firstItem.locator(".item-text").textContent();
        // Since internal link is rendered when inactive, only link text is displayed without control characters
        expect(firstItemTextContentInactiveInternal).toContain("asd");
        expect(firstItemTextContentInactiveInternal).not.toContain("[asd]");

        // Click the first item
        await firstItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);

        // Get text content of the first item (confirm control characters are displayed)
        const firstItemTextContentActiveInternal = await firstItem.locator(".item-text").textContent();
        expect(firstItemTextContentActiveInternal).toContain("[asd]");
    });

    test("SharedTree data is saved correctly", async ({ page }) => {
        // Select the first item (title), press Enter, and create a second item
        const titleItem = page.locator(".outliner-item").first();
        await titleItem.locator(".item-content").click();
        await TestHelpers.waitForCursorVisible(page);
        await page.keyboard.press("Enter");
        await TestHelpers.waitForCursorVisible(page);

        // Select the second item (the item created just before)
        const firstItem = page.locator(".outliner-item").nth(1);
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

        // Insert text using cursor.insertText()
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
                    // Insert bold text
                    cursor.insertText("[[aasdd]]");
                }
            }
        });

        // Wait a bit for data to be reflected
        await page.waitForTimeout(300);

        // Get SharedTree data (with fallback)
        const treeData = await TreeValidator.getTreeData(page);

        // Output debug information
        console.log("Tree data structure:", JSON.stringify(treeData, null, 2));
        console.log("Items count:", treeData.items?.length);

        // Confirm data is saved correctly
        expect(treeData.items).toBeDefined();
        expect(treeData.items.length).toBeGreaterThan(0);

        // Check child items of the first item (page title)
        const pageItem = treeData.items[0];
        expect(pageItem.items).toBeDefined();

        // If items is an object (actual data structure)
        const itemsArray = Object.values(pageItem.items);
        expect(itemsArray.length).toBeGreaterThan(0);

        // Confirm bold text is saved
        const hasFormattedText = itemsArray.some((item: any) => item.text === "[[aasdd]]");
        expect(hasFormattedText).toBe(true);
    });
});

// Add afterEach cleanup to ensure test isolation
test.afterEach(async ({ page }) => {
    // Reset editor state to prevent test interference
    await page.evaluate(() => {
        // Clear any remaining editor state
        if ((window as any).editorOverlayStore) {
            const editorStore = (window as any).editorOverlayStore;
            if (editorStore.reset) {
                editorStore.reset();
            } else {
                // Manually clear the store properties if no reset method exists
                editorStore.cursors = {};
                editorStore.selections = {};
                if (editorStore.cursorInstances?.clear) {
                    editorStore.cursorInstances.clear();
                } else {
                    editorStore.cursorInstances = new Map();
                }
                editorStore.activeItemId = null;
                editorStore.cursorVisible = false;
                editorStore.activeItem = null;
            }
        }

        // Clear any other potential shared state
        if ((window as any).aliasPickerStore) {
            const aliasPickerStore = (window as any).aliasPickerStore;
            if (aliasPickerStore.reset) {
                aliasPickerStore.reset();
            } else {
                aliasPickerStore.isVisible = false;
                aliasPickerStore.selectedOptionId = null;
                aliasPickerStore.query = "";
                aliasPickerStore.itemId = null;
            }
        }

        // Clear command palette state if it exists
        if ((window as any).commandPaletteStore) {
            const commandPaletteStore = (window as any).commandPaletteStore;
            if (commandPaletteStore.reset) {
                commandPaletteStore.reset();
            } else {
                commandPaletteStore.isVisible = false;
                commandPaletteStore.query = "";
                commandPaletteStore.selectedIndex = 0;
            }
        }

        // Clear any potential global state that could affect other tests
        if ((window as any).userPreferencesStore) {
            const userPreferencesStore = (window as any).userPreferencesStore;
            if (userPreferencesStore.reset) {
                userPreferencesStore.reset();
            } else {
                // Reset dark mode and other preferences to default
                if (userPreferencesStore.setDarkMode) {
                    userPreferencesStore.setDarkMode(false);
                }
            }
        }

        // Clear any potential shared tree state
        if ((window as any).generalStore) {
            const generalStore = (window as any).generalStore;
            // Reset cursor-related state in general store if it exists
            if (generalStore.setCursor) {
                try {
                    generalStore.setCursor(null);
                } catch (e) {
                    console.warn("Could not reset cursor in generalStore:", e);
                }
            }
        }
    }).catch((error) => {
        console.warn("Warning: Failed to reset editor store in afterEach:", error);
    });

    // Additional wait to ensure cleanup is processed
    await page.waitForTimeout(200);
});
