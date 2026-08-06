import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

test.describe("Toolbar Undo/Redo Buttons", () => {
    test("undoes and redoes model changes via desktop toolbar", async ({ page }) => {
        const { pageName } = await TestHelpers.seedProjectAndNavigate(page, test.info(), ["initial item"]);

        // Click the initial item to set focus
        const itemLocator = page.getByTestId("item-content-display").filter({ hasText: "initial item" }).first();
        await itemLocator.click();

        // Type in the second item
        await page.keyboard.press("Enter");
        await page.keyboard.type("second item");

        // Wait for UI update
        await expect(page.getByTestId("item-content-display").filter({ hasText: "second item" })).toBeVisible();

        // Verify that undo is enabled, redo is disabled
        const undoBtn = page.getByTestId("toolbar-undo");
        const redoBtn = page.getByTestId("toolbar-redo");
        await expect(undoBtn).toBeEnabled();
        await expect(redoBtn).toBeDisabled();

        // Click undo
        await undoBtn.click();

        // second item should be gone
        await expect(page.getByTestId("item-content-display").filter({ hasText: "second item" })).not.toBeVisible();
        await TreeValidator.verifyTreeState(page, [
            { text: pageName, children: 1 },
            { text: "initial item" },
        ]);

        await expect(undoBtn).toBeEnabled();
        await expect(redoBtn).toBeEnabled();

        // Click redo
        await redoBtn.click();

        // second item should be back
        await expect(page.getByTestId("item-content-display").filter({ hasText: "second item" })).toBeVisible();
        await TreeValidator.verifyTreeState(page, [
            { text: pageName, children: 2 },
            { text: "initial item" },
            { text: "second item" },
        ]);
        await expect(redoBtn).toBeDisabled();
    });

    test("undoes and redoes model changes via mobile toolbar", async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        const { pageName } = await TestHelpers.seedProjectAndNavigate(page, test.info(), ["initial item"]);

        // Click the initial item to set focus
        const itemLocator = page.getByTestId("item-content-display").filter({ hasText: "initial item" }).first();
        await itemLocator.click();

        // Type in the second item
        await page.keyboard.press("Enter");
        await page.keyboard.type("second item");

        // Wait for UI update
        await expect(page.getByTestId("item-content-display").filter({ hasText: "second item" })).toBeVisible();

        // Verify that mobile undo is enabled, redo is disabled
        const undoBtn = page.getByTestId("mobile-toolbar-undo");
        const redoBtn = page.getByTestId("mobile-toolbar-redo");
        await expect(undoBtn).toBeEnabled();
        await expect(redoBtn).toBeDisabled();

        // Click undo
        await undoBtn.click();

        // second item should be gone
        await expect(page.getByTestId("item-content-display").filter({ hasText: "second item" })).not.toBeVisible();
        await TreeValidator.verifyTreeState(page, [
            { text: pageName, children: 1 },
            { text: "initial item" },
        ]);

        await expect(undoBtn).toBeEnabled();
        await expect(redoBtn).toBeEnabled();

        // Click redo
        await redoBtn.click();

        // second item should be back
        await expect(page.getByTestId("item-content-display").filter({ hasText: "second item" })).toBeVisible();
        await TreeValidator.verifyTreeState(page, [
            { text: pageName, children: 2 },
            { text: "initial item" },
            { text: "second item" },
        ]);
        await expect(redoBtn).toBeDisabled();
    });
});
