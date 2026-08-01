import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../../utils/registerCoverageHooks";
import { TestHelpers } from "../../utils/testHelpers";

registerCoverageHooks();

test.describe("Mobile Action Toolbar Indent Undo", () => {
    // Mobile viewport so OutlinerToolbar renders its mobile branch
    test.use({ viewport: { width: 375, height: 667 } });

    test("mobile indent can be undone with undo gesture", async ({ page }, testInfo) => {
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Parent item", "Child item"]);

        const parentId = await TestHelpers.getItemIdByIndex(page, 1);
        const childId = await TestHelpers.getItemIdByIndex(page, 2);

        const childItemContainer = page.locator(`[data-item-id="${childId}"]`);
        await expect(childItemContainer).toHaveAttribute("aria-level", "1");

        // Click on the text to focus it
        await page.locator(`[data-item-id="${childId}"]`).click();

        // Wait for toolbar to be visible to ensure focus works and toolbar renders
        const toolbar = page.getByTestId("mobile-action-toolbar");
        await expect(toolbar).toBeVisible();

        // Click the indent button in the mobile toolbar
        await toolbar.getByRole("button", { name: "Indent" }).click();

        // Assert new indent level is 2
        await expect(childItemContainer).toHaveAttribute("aria-level", "2");

        // Wait a tiny bit to make sure Y.UndoManager catches it
        await page.waitForTimeout(100);

        // Execute global undo directly against Yjs UndoManager by finding general store
        await page.evaluate(() => {
            const generalStore = (window as any).generalStore;
            if (generalStore && generalStore.project && generalStore.project.undoManager) {
                generalStore.project.undoManager.undo();
            } else if (generalStore && generalStore._project && generalStore._project.undoManager) {
                generalStore._project.undoManager.undo();
            } else if (generalStore && generalStore.undoManager) {
                generalStore.undoManager.undo();
            } else {
                 throw new Error('UndoManager not found on window object.');
            }
        });

        // Assert it is back to indent level 1
        await expect(childItemContainer).toHaveAttribute("aria-level", "1");
    });
});
