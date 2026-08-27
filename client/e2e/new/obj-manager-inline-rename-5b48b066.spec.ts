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

// `createBlankGrid` names the Table and its Grid host identically, so every
// row lookup here is scoped to the Grid badge — the object being renamed.
function gridRow(page: import("@playwright/test").Page, name: string) {
    return page.locator('[data-testid^="object-row-"]').filter({ hasText: name }).filter({
        has: page.locator(".type-badge.grid"),
    });
}

test.describe("FTR-8ac92ce2: clicking an object's name renames it in place", () => {
    test("blur commits, Enter commits, Escape cancels", async ({ page }, testInfo) => {
        test.setTimeout(120000);
        await TestHelpers.seedProjectAndNavigate(page, testInfo, ["Item 1"]);
        await createBlankGrid(page, "Rename Me", "rename_me");

        const sidebar = await openSidebar(page);
        await sidebar.getByRole("link", { name: "Object Manager" }).click();
        await expect(page).toHaveURL(/\/objects$/, { timeout: 15000 });
        const row = gridRow(page, "Rename Me");
        await expect(row).toBeVisible({ timeout: 15000 });

        // Click the name to enter rename mode; the input is auto-focused.
        await row.locator(".name-button").click();
        const nameInput = row.locator("input.edit-input");
        await expect(nameInput).toBeVisible();
        await expect(nameInput).toBeFocused();

        // Blur commits.
        await nameInput.fill("Renamed Via Blur");
        await page.locator("h1", { hasText: "Objects Manager" }).click();
        const renamedRow = page.locator('[data-testid^="object-row-"]').filter({ hasText: "Renamed Via Blur" });
        await expect(renamedRow).toBeVisible({ timeout: 10000 });
        await expect(renamedRow.locator("input.edit-input")).toBeHidden();

        // Enter commits.
        await renamedRow.locator(".name-button").click();
        const nameInput2 = renamedRow.locator("input.edit-input");
        await expect(nameInput2).toBeVisible();
        await nameInput2.fill("Renamed Via Enter");
        await nameInput2.press("Enter");
        const enterRow = page.locator('[data-testid^="object-row-"]').filter({ hasText: "Renamed Via Enter" });
        await expect(enterRow).toBeVisible({ timeout: 10000 });

        // Escape cancels and restores the previous name.
        await enterRow.locator(".name-button").click();
        const nameInput3 = enterRow.locator("input.edit-input");
        await expect(nameInput3).toBeVisible();
        await nameInput3.fill("This Should Not Stick");
        await nameInput3.press("Escape");
        await expect(page.locator('[data-testid^="object-row-"]').filter({ hasText: "This Should Not Stick" }))
            .toHaveCount(0);
        await expect(page.locator('[data-testid^="object-row-"]').filter({ hasText: "Renamed Via Enter" }))
            .toBeVisible();
    });
});
