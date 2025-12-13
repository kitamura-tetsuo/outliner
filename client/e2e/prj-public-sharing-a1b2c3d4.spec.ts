import { test, expect } from "@playwright/test";
import { TestHelpers } from "./utils/testHelpers";

test.describe("Public Sharing", () => {
    test("should toggle public sharing and generate a public URL", async ({ page }) => {
        const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page);
        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);
        await page.goto(`/${encodedProject}/${encodedPage}`);

        // Open the sharing dialog
        await page.click("#share-button"); // Assuming a share button exists

        // Initial state should be private
        const isPublicCheckbox = page.locator("#public-toggle");
        await expect(isPublicCheckbox).not.toBeChecked();

        // Make the project public
        await isPublicCheckbox.check();

        // Verify that a public URL is generated
        const publicUrlInput = page.locator("#public-url");
        const publicUrl = await publicUrlInput.inputValue();
        expect(publicUrl).toContain(`/${encodedProject}?token=`);

        // Copy the URL
        await page.click("#copy-url-button");
        const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboardText).toBe(publicUrl);

        // Make the project private again
        await isPublicCheckbox.uncheck();
        await expect(publicUrlInput).toBeHidden();
    });
});
