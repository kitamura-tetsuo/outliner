import { expect, test } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();

test("sidebar Pages header contains a uniquely named Add new page button", async ({ page }) => {
    await page.goto("/demo/Outliner%20Basics");

    // The main issue might be we need to actually wait for the page to be ready
    await expect(page.locator(".outliner-item").first()).toBeVisible({ timeout: 10000 });

    // Check if sidebar is open, if not click "Show sidebar" button
    const showSidebarBtn = page.getByRole("button", { name: "Show sidebar" });
    if (await showSidebarBtn.isVisible()) {
        await showSidebarBtn.click();
    }

    // Ensure the Pages section is visible
    const pagesHeader = page.getByRole("button", { name: "Toggle pages section" });
    await expect(pagesHeader).toBeVisible({ timeout: 10000 });

    const addPageBtn = page.getByRole("button", { name: "Add new page" });
    await expect(addPageBtn).toBeAttached({ timeout: 10000 });
    await expect(addPageBtn).toHaveClass(/add-page-btn/);
});
