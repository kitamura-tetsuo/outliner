import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test.describe("Italic Syntax Ambiguity", () => {
    test("typing [/ italic text] creates italics without triggering command palette", async ({ page }, testInfo) => {
        // Seed project and navigate with one item
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["initial item"]);

        // Wait for basic rendering
        await TestHelpers.waitForOutlinerItems(page);

        // Get the 2nd item (first item that is not the page title)
        const firstItem = page.locator(".outliner-item").nth(1);
        await firstItem.locator(".item-content").click();

        // Move cursor to the end of the line
        await page.keyboard.press("End");

        // Type the italic syntax slowly to prevent racing with Svelte reactivity/focus loss when palette hides
        await page.keyboard.type(" [/", { delay: 50 });

        // At this point palette should be open
        // Now type the space that should dismiss it
        await page.keyboard.type(" ", { delay: 50 });

        // Assert that the command palette got dismissed / is not visible
        const commandPalette = page.locator(".command-palette");
        await expect(commandPalette).not.toBeVisible();

        // Svelte reactivity can be asynchronous when text state changes locally. Wait for DOM to stabilize
        await page.waitForTimeout(100);

        // Finish typing the rest of the text
        await page.keyboard.insertText("italic text]");

        // Ensure the text was fully inserted into the contenteditable (active item text shows syntax)
        const textLocator = firstItem.locator(".item-text").first();
        await expect(textLocator).toContainText("initial item [/ italic text]");

        // Move to the next item to unfocus the first item and render the HTML formatting
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(100);

        // Assert that the rendered HTML contains <em> tags for the italics
        await textLocator.locator("em").waitFor({ state: "attached", timeout: 5000 }).catch(() => {});
        const innerHTML = await textLocator.innerHTML();
        expect(innerHTML).toContain("<em>italic text</em>");

        // And also verify that no characters were dropped
        expect(await textLocator.textContent()).toContain("initial item");
        expect(await textLocator.textContent()).toContain("italic text");
    });
});
