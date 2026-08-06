import { expect, test } from "@playwright/test";
import { TreeValidator } from "../utils/treeValidation";
import { TestHelpers } from "../utils/testHelpers";
import { devices } from "@playwright/test";

test.use({ ...devices["Pixel 7"] });

test.describe("Mobile InputType Editing (Android Chrome IME)", () => {
    test("handles various inputTypes correctly", async ({ page }, testInfo) => {
        const { pageName } = await TestHelpers.seedProjectAndNavigate(page, testInfo, ["item1"]);

        await page.waitForSelector(".outliner-item");

        const items = await page.locator(".outliner-item").all();
        const firstItem = items[0];
        await firstItem.click();

        const textarea = page.locator(".global-textarea");
        await textarea.waitFor({ state: "attached" });

        await page.evaluate(() => {
            const activeEl = document.activeElement;
            if (activeEl) {
                 activeEl.dispatchEvent(new InputEvent("beforeinput", { inputType: "deleteSoftLineBackward", bubbles: true, cancelable: true }));
            }
        });

        await page.waitForTimeout(100);

        await page.evaluate(() => {
            const activeEl = document.activeElement;
            if (activeEl) {
                 activeEl.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertLineBreak", bubbles: true, cancelable: true }));
            }
        });

        await page.waitForTimeout(100);

        const newItems = await page.locator(".outliner-item").all();
        expect(newItems.length).toBeGreaterThan(1);
    });
});
