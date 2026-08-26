import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test("Text -> Text reorder natively via drag and drop payload preservation", async ({ page }) => {
    // Navigate to a new project page
    const projectInfo = await TestHelpers.seedProjectAndNavigate(page, test.info());
    const url = `http://localhost:7090/${encodeURIComponent(projectInfo.projectName)}/${
        encodeURIComponent(projectInfo.pageName)
    }`;
    await page.goto(url);
    await TestHelpers.waitForOutlinerItems(page, 1);

    // Create First Item
    const firstItem = page.locator(".outliner-item").nth(0);
    await firstItem.click();
    await page.keyboard.type("First Item");
    await page.keyboard.press("Enter");

    // Create Second Item
    await page.keyboard.type("Second Item");

    await expect(page.locator(".outliner-item").nth(0)).toContainText("First Item");
    await expect(page.locator(".outliner-item").nth(1)).toContainText("Second Item");

    const firstItemId = await page.locator(".outliner-item").nth(0).getAttribute("data-item-id");
    const secondItemId = await page.locator(".outliner-item").nth(1).getAttribute("data-item-id");

    expect(firstItemId).not.toBeNull();
    expect(secondItemId).not.toBeNull();

    // Now construct a drop using browser events that perfectly simulate the payload preservation bug
    await page.evaluate(({ firstItemId, secondItemId }) => {
        const firstEl = document.querySelector(`.outliner-item[data-item-id="${firstItemId}"] .item-content`);
        const secondEl = document.querySelector(`.outliner-item[data-item-id="${secondItemId}"] .item-content`);

        if (!firstEl || !secondEl) throw new Error("Elements not found");

        // dragover
        const dragOverEvent = new DragEvent("dragover", {
            bubbles: true,
            cancelable: true,
            clientY: secondEl.getBoundingClientRect().bottom - 2, // bottom drop
        });
        Object.defineProperty(dragOverEvent, "dataTransfer", {
            value: new DataTransfer(),
        });
        secondEl.dispatchEvent(dragOverEvent);

        // drop
        const dataTransfer = new DataTransfer();
        dataTransfer.setData("application/x-outliner-item", firstItemId!);

        const originalGetData = dataTransfer.getData.bind(dataTransfer);
        let storeAvailable = true;

        dataTransfer.getData = (format) => {
            if (!storeAvailable) return "";
            return originalGetData(format);
        };

        // This is the crux of the test: Native browser behavior makes store empty in the next microtask!
        Promise.resolve().then(() => {
            storeAvailable = false;
        });

        const dropEvent = new DragEvent("drop", { bubbles: true, cancelable: true });
        Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });

        secondEl.dispatchEvent(dropEvent);
    }, { firstItemId, secondItemId });

    // Wait for changes to be applied
    await page.waitForTimeout(100);

    // The order should be reversed now
    await expect(page.locator(".outliner-item").nth(0)).toContainText("Second Item");
    await expect(page.locator(".outliner-item").nth(1)).toContainText("First Item");
});

test("Layout Grid move-out natively via drag and drop payload preservation", async ({ page }) => {
    // Add layout with grid child
    const projectInfo = await TestHelpers.seedProjectAndNavigate(page, test.info());
    const url = `http://localhost:7090/${encodeURIComponent(projectInfo.projectName)}/${
        encodeURIComponent(projectInfo.pageName)
    }`;
    await page.goto(url);
    await TestHelpers.waitForOutlinerItems(page, 1);

    await page.keyboard.type("/layout");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500); // Wait for block

    // Move into layout, type slash command to create grid
    await page.keyboard.press("Enter"); // should focus block
    await page.keyboard.type("/grid");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500); // Wait for block

    // Go back and create regular text block to drop into
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.type("Target Outline Item");

    // Evaluate layout items and move them. We will rely on selectors to get ids.
    await page.waitForTimeout(1000);

    // The previous structure will have created a layout block and a target block
    // We can evaluate directly to grab the gridItemId and targetItemId
    const gridItem = page.locator(`.outliner-item[data-node-kind="grid"]`);
    const gridItemId = await gridItem.getAttribute("data-item-id");

    const targetItemLocator = page.locator(".outliner-item").filter({ hasText: "Target Outline Item" });
    const targetItemId = await targetItemLocator.getAttribute("data-item-id");

    if (gridItemId && targetItemId) {
        await page.evaluate(({ gridItemId, targetItemId }) => {
            const gridEl = document.querySelector(`.outliner-item[data-item-id="${gridItemId}"] .item-content`);
            const targetEl = document.querySelector(`.outliner-item[data-item-id="${targetItemId}"] .item-content`);

            if (!gridEl || !targetEl) throw new Error("Elements not found");

            const dragOverEvent = new DragEvent("dragover", {
                bubbles: true,
                cancelable: true,
                clientY: targetEl.getBoundingClientRect().bottom - 2, // bottom drop
            });
            Object.defineProperty(dragOverEvent, "dataTransfer", {
                value: new DataTransfer(),
            });
            targetEl.dispatchEvent(dragOverEvent);

            const dataTransfer = new DataTransfer();
            // Uses the outliner-item payload type
            dataTransfer.setData("application/x-outliner-item", gridItemId!);

            const originalGetData = dataTransfer.getData.bind(dataTransfer);
            let storeAvailable = true;

            dataTransfer.getData = (format) => {
                if (!storeAvailable) return "";
                return originalGetData(format);
            };

            Promise.resolve().then(() => {
                storeAvailable = false;
            });

            const dropEvent = new DragEvent("drop", { bubbles: true, cancelable: true });
            Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });

            targetEl.dispatchEvent(dropEvent);
        }, { gridItemId, targetItemId });

        // Wait for changes to be applied
        await page.waitForTimeout(500);

        // Grid should now be a sibling to the text item
        // Check it is not inside layout component wrapper
        const isInsideLayout = await gridItem.evaluate((el) => {
            return el.closest(".layout-container") !== null;
        });
        expect(isInsideLayout).toBe(false);
    }
});
