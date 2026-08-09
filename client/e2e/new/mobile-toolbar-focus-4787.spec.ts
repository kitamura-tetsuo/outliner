import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("Mobile action toolbar buttons retain editor focus", () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test("mobile toolbar buttons do not blur the global textarea", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Mobile test item"]);

        await expect(page.getByTestId("mobile-action-toolbar")).toBeVisible({ timeout: 10000 });

        const itemText = page.locator(".outliner-item").first().locator(".item-text").first();
        await itemText.click();
        await TestHelpers.waitForCursorVisible(page);

        let activeClass = await page.evaluate(() => document.activeElement?.className);
        expect(activeClass).toContain("global-textarea");

        const buttonsToTest = [
            "Indent",
            "Outdent",
            "Insert Above",
            "Insert Below",
            "New Child",
            "Insert Sibling Below",
            "Vote",
            "Delete",
        ];

        for (const title of buttonsToTest) {
            // Restore focus to editor before clicking the button, in case a previous action messed with it
            const currentItem = page.locator(".outliner-item").last().locator(".item-text").first();
            await currentItem.click();
            await TestHelpers.waitForCursorVisible(page);

            const btn = page.getByTitle(title);
            await expect(btn).toBeVisible();
            await btn.click();

            // Allow a short moment for focus shifts, if any
            await page.waitForTimeout(100);

            // Handle UI changes triggered by the button (modals or popovers)
            if (title === "Delete" || title === "Vote") {
                // For Delete, it opens a ConfirmDialog which shifts focus.
                // For Vote, it opens an overlay or popover which might also shift focus.
                // The issue statement is about pointerdown blurring the editor before the action.
                // Let's just verify that right after click, if no dialog steals focus, it's correct.
                // Actually, if a modal appears and auto-focuses 'Cancel', then the textarea is blurred by the modal, not the button.
                // The fix keeps focus *during the tap*.
                // We can cancel the dialog to continue the test.
                const cancelBtn = page.getByRole("button", { name: "Cancel" });
                if (await cancelBtn.isVisible({ timeout: 1000 })) {
                    await cancelBtn.click();
                } else {
                    // Try checking for page mask or similar if vote opens something else
                    await page.keyboard.press("Escape");
                }
                continue; // Focus is expected to move for modals, skipping assert for these if modal appeared.
            }

            activeClass = await page.evaluate(() => document.activeElement?.className);
            expect(activeClass).toContain("global-textarea");

            // Additional wait to let internal operations (like insert) complete and cursor resync
            await TestHelpers.waitForCursorVisible(page);
        }
    });
});
