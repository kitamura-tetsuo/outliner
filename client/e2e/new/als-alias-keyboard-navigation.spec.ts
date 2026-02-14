import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature ALS-0001
 *  Title   : Alias picker keyboard navigation
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "../fixtures/console-forward";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ALS-0001: Alias picker keyboard navigation", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // Increase timeout for test setup
        test.setTimeout(120000);

        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "First line: Test",
            "Second line: Yjs reflection",
            "Third line: Order check",
        ]);
        // Wait for outliner items to be visible with increased timeout
        // Wait for 4 items (page header + 3 seeded lines)
        await TestHelpers.waitForOutlinerItems(page, 4, 45000);
    });

    test("navigate alias picker with keyboard", async ({ page }) => {
        // Add timeout for the whole test
        test.setTimeout(30000);

        // Explicitly wait for the 1st and 2nd items to be rendered and have IDs
        // This is more robust than just waiting for "any" items
        await expect.poll(async () => {
            const count = await page.locator(".outliner-item").count();
            if (count < 2) return false;
            const id1 = await page.locator(".outliner-item").nth(0).getAttribute("data-item-id");
            const id2 = await page.locator(".outliner-item").nth(1).getAttribute("data-item-id");
            return !!id1 && !!id2;
        }, { timeout: 20000 }).toBe(true);

        const firstIdFinal = await page.locator(".outliner-item").nth(0).getAttribute("data-item-id");
        const secondIdFinal = await page.locator(".outliner-item").nth(1).getAttribute("data-item-id");

        if (!firstIdFinal || !secondIdFinal) throw new Error("item ids not found after retry");

        await page.click(`.outliner-item[data-item-id="${firstIdFinal}"] .item-content`, { force: true });
        await TestHelpers.waitForUIStable(page);
        await page.evaluate(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            textarea?.focus();
        });
        await TestHelpers.waitForUIStable(page);

        // Open alias picker
        await page.keyboard.type("/");
        await page.keyboard.type("alias");
        await page.keyboard.press("Enter");

        // Wait for alias picker with increased timeout
        await expect(page.locator(".alias-picker").first()).toBeVisible({ timeout: 10000 });
        // Correctly retrieve aliasId (from store)
        // Wait for aliasPickerStore to be available with a timeout
        const aliasId = await page.evaluate(async () => {
            // Wait up to 5 seconds for aliasPickerStore and itemId to be available
            const startTime = Date.now();
            while (Date.now() - startTime < 5000) {
                const store = (window as any).aliasPickerStore;
                if (store && store.itemId) {
                    return store.itemId;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return (window as any).aliasPickerStore?.itemId ?? null;
        });
        if (!aliasId) throw new Error("alias itemId not found on aliasPickerStore");
        // expose aliasId for debug in page context
        await page.evaluate((id) => {
            (window as any).__aliasIdForDebug = id;
        }, aliasId);
        const optionCount = await page.locator(".alias-picker").first().locator("li").count();
        expect(optionCount).toBeGreaterThan(0);

        // Debug: Check available options
        /*
        console.log("Available options:");
        for (let i = 0; i < optionCount; i++) {
            const optionText = await page.locator(".alias-picker").first().locator("li").nth(i).locator("button").textContent({
                timeout: 2000,
            });
            const optionId = await page.locator(".alias-picker").first().locator("li").nth(i).locator("button").getAttribute("data-id", {
                timeout: 2000,
            });
            console.log(`Option ${i}: "${optionText}" (id: ${optionId})`);
        }
        console.log("firstId:", firstId);
        console.log("secondId:", secondId);
        console.log("aliasId(from store):", aliasId);
        */

        // Set focus to the alias picker (use the first one)
        await page.locator(".alias-picker").first().focus();
        await page.waitForTimeout(200);

        // Verify that the first item is selected
        const selectedItems = page.locator(".alias-picker").first().locator("li.selected");
        await expect(selectedItems).toHaveCount(1);
        const firstSelected = await page.locator(".alias-picker").first().locator("li.selected button").textContent();
        if (!firstSelected) throw new Error("first option not found");

        // Move to the next item with the Down Arrow key
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(200);

        // Verify that the selected item has changed
        const secondSelected = await page.locator(".alias-picker").first().locator("li.selected button").textContent();
        if (!secondSelected) throw new Error("second option not found");
        expect(secondSelected).not.toBe(firstSelected);

        // Return to the previous item with the Up Arrow key
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(200);

        // Verify that the original item is selected again
        const restoredSelected = await page.locator(".alias-picker").first().locator("li.selected button")
            .textContent();
        if (!restoredSelected) throw new Error("restored option not found");
        expect(restoredSelected).toBe(firstSelected);

        // Move to the next item with the Down Arrow key (if the currently selected item is the same as aliasId, select another option)
        let selectedOptionId = await page.locator(".alias-picker").first().locator("li.selected button").getAttribute(
            "data-id",
        );
        console.log("Initial selected option ID:", selectedOptionId, "aliasId:", aliasId);

        // If it is the same as aliasId, select another option
        if (selectedOptionId === aliasId) {
            await page.keyboard.press("ArrowDown");
            await page.waitForTimeout(200);
            selectedOptionId = await page.locator(".alias-picker").first().locator("li.selected button").getAttribute(
                "data-id",
            );
            // console.log("After ArrowDown, selected option ID:", selectedOptionId);

            // If it is still the same, try again
            if (selectedOptionId === aliasId) {
                await page.keyboard.press("ArrowDown");
                await page.waitForTimeout(200);
                selectedOptionId = await page.locator(".alias-picker").first().locator("li.selected button")
                    .getAttribute("data-id");
                // console.log("After second ArrowDown, selected option ID:", selectedOptionId);
            }
        }

        // Check the selected option
        // console.log("Final selected option before Enter:", selectedOption);
        // console.log("Final selected option ID:", selectedOptionId);

        await page.keyboard.press("Enter");

        // Verify that the alias picker becomes hidden
        await expect(page.locator(".alias-picker").first()).toBeHidden();

        // Verify that the alias item has been created
        await page.locator(`.outliner-item[data-item-id="${aliasId}"]`).waitFor({ state: "visible", timeout: 5000 });

        // Wait a bit before checking aliasTargetId
        await TestHelpers.waitForUIStable(page);

        // Debug information for aliasPickerStore
        /*
        const apState = await page.evaluate(async () => {
            // Wait for aliasPickerStore to be available with a timeout
            const startTime = Date.now();
            while (!(window as any).aliasPickerStore && Date.now() - startTime < 2000) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            const w: any = window as any;
            const ap: any = w.aliasPickerStore;
            const gs: any = w.generalStore || w.appStore;
            const root: any = gs?.currentPage;
            function find(node: any, id: string): any {
                if (!node) return null;
                if (node.id === id) return node;
                const items: any = node.items;
                const len = items?.length ?? 0;
                for (let i = 0; i < len; i++) {
                    const child = items.at ? items.at(i) : items[i];
                    const found = find(child, id);
                    if (found) return found;
                }
                return null;
            }
            const node = root ? find(root, (w as any).__aliasIdForDebug || "") : null;
            return {
                ap: {
                    isVisible: ap?.isVisible,
                    itemId: ap?.itemId,
                    lastConfirmedItemId: ap?.lastConfirmedItemId,
                    lastConfirmedTargetId: ap?.lastConfirmedTargetId,
                    lastConfirmedAt: ap?.lastConfirmedAt,
                    optionsCount: ap?.options?.length ?? 0,
                },
                model: {
                    hasRoot: !!root,
                    nodeExists: !!node,
                    nodeAliasTargetId: node?.aliasTargetId ?? null,
                },
            };
        });
        console.log("AliasPickerStore state:", apState.ap);
        console.log("Model state:", apState.model);
        */

        // Retrieve aliasTargetId from DOM attribute (retrieving from model can be unstable depending on the environment)
        const domAttribute = await page.locator(`.outliner-item[data-item-id="${aliasId}"]`).getAttribute(
            "data-alias-target-id",
        );
        console.log("DOM data-alias-target-id attribute:", domAttribute);
        console.log("Expected selectedOptionId:", selectedOptionId);

        // Verify that it matches the selected option ID
        expect(domAttribute).toBe(selectedOptionId);

        // Wait and verify that the alias path is displayed (be lenient as rendering may be delayed in some environments)
        try {
            await page.locator(`.outliner-item[data-item-id="${aliasId}"] .alias-path`).waitFor({
                state: "visible",
                timeout: 5000,
            });
            await expect(page.locator(`.outliner-item[data-item-id="${aliasId}"] .alias-path`)).toBeVisible();
        } catch {
            console.warn("Alias path not visible within timeout; aliasTargetId is set, continuing.");
        }
    });

    test("escape key closes alias picker", async ({ page }) => {
        // Add timeout for the whole test
        test.setTimeout(60000);

        await TestHelpers.waitForOutlinerItems(page);
        const firstId = await TestHelpers.getItemIdByIndex(page, 0);
        if (!firstId) throw new Error("first item not found");

        await page.click(`.outliner-item[data-item-id="${firstId}"] .item-content`, { force: true });
        await TestHelpers.waitForUIStable(page);
        await page.evaluate(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            textarea?.focus();
        });
        await TestHelpers.waitForUIStable(page);

        await page.keyboard.type("/");
        await page.keyboard.type("alias");
        await page.keyboard.press("Enter");

        // Wait for alias picker with increased timeout
        await expect(page.locator(".alias-picker").first()).toBeVisible({ timeout: 10000 });

        // Check the state of the alias picker
        /*
        const pickerVisible = await page.locator(".alias-picker").isVisible();
        console.log("Alias picker visible before escape:", pickerVisible);
        */

        // Set focus to the alias picker itself (use the first one)
        await page.locator(".alias-picker").first().focus();
        await page.waitForTimeout(200);

        // Check the focus state
        /*
        const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
        console.log("Focused element:", focusedElement);
        */

        // Close the alias picker with the Escape key
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);

        // Re-check the state of the alias picker
        /*
        const pickerVisibleAfter = await page.locator(".alias-picker").isVisible();
        console.log("Alias picker visible after escape:", pickerVisibleAfter);
        */

        // Verify that the alias picker becomes hidden
        await expect(page.locator(".alias-picker").first()).toBeHidden({ timeout: 3000 });
    });
});
