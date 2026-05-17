import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

import { expect, test } from "@playwright/test";
import fs from "fs";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Image Addition Button (att-image-button-a1b2c3d4)", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo, [
            "ITEM 1",
            "ITEM 2",
        ]);
        await TestHelpers.waitForOutlinerItems(page, 3);
    });

    test("clicking Add Image button adds a file to the end of the tree", async ({ page }) => {
        // Initial count is 3
        await expect(page.locator(".outliner-item")).toHaveCount(3);

        const addImageButton = page.locator(".outliner .toolbar .actions button", { hasText: "Add Image" });
        await expect(addImageButton).toBeVisible();

        const pngHeader = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]);
        const testFilePath = "/tmp/test-button.png";
        fs.writeFileSync(testFilePath, pngHeader);

        // Wait for file chooser
        const fileChooserPromise = page.waitForEvent("filechooser");
        await addImageButton.click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles(testFilePath);

        // Should have 4 items now
        await expect(page.locator(".outliner-item")).toHaveCount(4, { timeout: 15000 });

        // The new item should be at the end
        const newItemId = await TestHelpers.getItemIdByIndex(page, 3);
        const attachments = page.locator(`[data-item-id="${newItemId}"] .attachment-preview`);
        await expect(attachments).toHaveCount(1, { timeout: 15000 });
    });
});
