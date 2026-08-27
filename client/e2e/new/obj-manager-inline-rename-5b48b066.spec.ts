import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature FTR-8ac92ce2
 *  Title   : Object Manager click-to-rename
 *  Source  : docs/client-features/obj-project-object-manager-8ac92ce2.yaml
 */
import { expect, test } from "@playwright/test";
import { createBlankGrid } from "../utils/crossProjectGridHelpers";
import { TestHelpers } from "../utils/testHelpers";

async function openSidebar(page: import("@playwright/test").Page) {
    const showBtn = page.locator('button[aria-label="Show sidebar"]');
    if (await showBtn.isVisible().catch(() => false)) await showBtn.click();
    const sidebar = page.locator('aside.sidebar[aria-label="Main Sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
    return sidebar;
}

test.describe("FTR-8ac92ce2: clicking an object's name renames it in place", () => {
    test("blur commits, Enter commits, Escape cancels", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Item 1"]);
        await createBlankGrid(page, "Rename Me", "rename_me");

        const sidebar = await openSidebar(page);
        await sidebar.getByRole("link", { name: "Object Manager" }).click();
        await expect(page).toHaveURL(/\/objects$/, { timeout: 15000 });

        // `createBlankGrid` names the Table and its Grid host identically, so
        // the Grid row is picked out by its badge, then addressed by its own
        // stable `data-testid` from here on — once rename mode swaps the name
        // button for an `<input>`, the row's own text content no longer
        // contains "Rename Me" (an input's value isn't text content), so a
        // `hasText` filter would stop matching the very row being edited.
        const initialRow = page.locator('[data-testid^="object-row-"]').filter({ hasText: "Rename Me" }).filter({
            has: page.locator(".type-badge.grid"),
        });
        await expect(initialRow).toBeVisible({ timeout: 15000 });
        const testId = await initialRow.getAttribute("data-testid");
        const row = page.locator(`[data-testid="${testId}"]`);

        // Click the name to enter rename mode; the input is auto-focused.
        await row.locator(".name-button").click();
        const nameInput = row.locator("input.edit-input");
        await expect(nameInput).toBeVisible();
        await expect(nameInput).toBeFocused();

        // Blur commits.
        await nameInput.fill("Renamed Via Blur");
        await page.locator("h1", { hasText: "Objects Manager" }).click();
        await expect(row).toContainText("Renamed Via Blur", { timeout: 10000 });
        await expect(row.locator("input.edit-input")).toBeHidden();

        // Enter commits.
        await row.locator(".name-button").click();
        const nameInput2 = row.locator("input.edit-input");
        await expect(nameInput2).toBeVisible();
        await nameInput2.fill("Renamed Via Enter");
        await nameInput2.press("Enter");
        await expect(row).toContainText("Renamed Via Enter", { timeout: 10000 });

        // Escape cancels and restores the previous name.
        await row.locator(".name-button").click();
        const nameInput3 = row.locator("input.edit-input");
        await expect(nameInput3).toBeVisible();
        await nameInput3.fill("This Should Not Stick");
        await nameInput3.press("Escape");
        await expect(row.locator("input.edit-input")).toBeHidden();
        await expect(row).toContainText("Renamed Via Enter");
        await expect(row).not.toContainText("This Should Not Stick");
    });
});
