import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { CursorValidator } from "../utils/cursorValidation";
import { v4 as uuidv4 } from "uuid";

test.describe("CLM-103: Cursor Blinking Behavior", () => {
    let projectTitle: string;
    let pageTitle: string;

    test.beforeEach(async ({ page }, testInfo) => {
        projectTitle = `proj-${uuidv4()}`;
        pageTitle = `page-${uuidv4()}`;

        await TestHelpers.seedProjectAndNavigateForProject(page, testInfo, ["Line 1", "Line 2"], undefined, {
            projectName: projectTitle,
            pageName: pageTitle,
            skipAppReady: false
        });
    });

    test("A local active item cursor blinks continuously", async ({ page }) => {
        // Find the first item via placeholder/content and click
        const firstItem = page.locator(".item-content").first();
        await firstItem.click();

        // Ensure the editor has focus
        const textarea = page.locator(".global-textarea");
        await textarea.waitFor({ state: "attached" });
        await textarea.focus();

        // Verify active cursor exists
        await page.locator(".editor-overlay .cursor.active").first().waitFor({ state: "attached" });

        // Assert cursor blinking using the utility, which measures opacity changes
        await CursorValidator.assertCursorBlink(page, 600);
    });

    test("Blinking phase restarts on whenever the user types", async ({ page }) => {
        // Find the first item and click
        const firstItem = page.locator(".item-content").first();
        await firstItem.click();

        const textarea = page.locator(".global-textarea");
        await textarea.waitFor({ state: "attached" });
        await textarea.focus();

        await page.locator(".editor-overlay .cursor.active").first().waitFor({ state: "attached" });

        // Type to trigger blink restart
        await page.keyboard.type("Restart test");

        // Measure immediately after typing; opacity should be "1"
        const opacityAfterTyping = await page.evaluate(() => {
            const cursor = document.querySelector(".editor-overlay .cursor.active");
            return cursor ? globalThis.getComputedStyle(cursor).opacity : null;
        });

        expect(opacityAfterTyping).toBe("1");
    });
});
