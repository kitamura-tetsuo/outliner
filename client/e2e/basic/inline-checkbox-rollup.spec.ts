import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
import { expect, type Page, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * CHK-0002: "Parent checkboxes reflect completion status of child checkboxes".
 *
 * The roll-up must run whenever the set of children changes, not only when a
 * checkbox is clicked. Seeded lines are always flat, so each test builds its
 * hierarchy with Tab. An item that is being edited renders as plain text, so
 * assertions target checkboxes by aria-label rather than by index.
 */

/** The checkbox rendered for the item whose text (minus the `[ ] ` prefix) is `label`. */
function checkbox(page: Page, label: string) {
    return page.locator(`input[type="checkbox"].inline-checkbox[aria-label="${label}"]`);
}

/** Focuses an item by its text so subsequent keystrokes are applied to it. */
async function focusItem(page: Page, text: string) {
    const item = page.locator(".outliner-item[data-item-id]", { hasText: text }).first();
    await item.locator(".item-content").first().click();
    await page.waitForTimeout(500);
    await TestHelpers.waitForCursorVisible(page);
}

/** Makes the focused item a child of the item above it. */
async function indent(page: Page) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(500);
}

test("unchecks a checked parent when an unchecked child is added", async ({ page }, testInfo) => {
    const lines = ["[x] Parent", "[x] Child A"];
    const { projectName, pageName } = await TestHelpers.seedProjectDataOnly(page, testInfo, lines);
    await TestHelpers.navigateToProjectPage(page, projectName, pageName, lines);

    await expect(checkbox(page, "Parent")).toBeChecked({ timeout: 5000 });

    await focusItem(page, "Child A");
    await indent(page);
    await expect(checkbox(page, "Parent")).toBeChecked();

    // Add "[ ] Child B" as a second child of Parent.
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    await page.keyboard.type("[ ] Child B");

    // The parent must follow its new unchecked child.
    await expect(checkbox(page, "Parent")).not.toBeChecked({ timeout: 5000 });
});

test("checks an unchecked parent when its last unchecked child is deleted", async ({ page }, testInfo) => {
    const lines = ["[ ] Parent", "[x] Child A", "[ ] Child B"];
    const { projectName, pageName } = await TestHelpers.seedProjectDataOnly(page, testInfo, lines);
    await TestHelpers.navigateToProjectPage(page, projectName, pageName, lines);

    await expect(checkbox(page, "Parent")).not.toBeChecked({ timeout: 5000 });

    await focusItem(page, "Child A");
    await indent(page);
    await focusItem(page, "Child B");
    await indent(page);

    // Parent now has one checked and one unchecked child.
    await expect(checkbox(page, "Parent")).not.toBeChecked({ timeout: 5000 });

    // Clear "[ ] Child B" and delete the now-empty item by merging it into Child A.
    await page.keyboard.press("End");
    for (let i = 0; i < "[ ] Child B".length + 1; i++) {
        await page.keyboard.press("Backspace");
    }
    await page.waitForTimeout(500);

    // Only "[x] Child A" is left, so the parent must become checked.
    await expect(page.locator(".outliner-item[data-item-id]", { hasText: "Child B" })).toHaveCount(0);
    await expect(checkbox(page, "Parent")).toBeChecked({ timeout: 5000 });
});

test("rolls up recursively when an unchecked item is indented under a grandparent", async ({ page }, testInfo) => {
    const lines = ["[x] Parent", "[x] Child A", "[ ] Task"];
    const { projectName, pageName } = await TestHelpers.seedProjectDataOnly(page, testInfo, lines);
    await TestHelpers.navigateToProjectPage(page, projectName, pageName, lines);

    await expect(checkbox(page, "Parent")).toBeChecked({ timeout: 5000 });

    await focusItem(page, "Child A");
    await indent(page);
    await expect(checkbox(page, "Parent")).toBeChecked();

    // Two indents put "[ ] Task" under Child A, which is itself under Parent.
    await focusItem(page, "Task");
    await indent(page);
    await indent(page);

    // The roll-up has to walk Task -> Child A -> Parent.
    await expect(checkbox(page, "Child A")).not.toBeChecked({ timeout: 5000 });
    await expect(checkbox(page, "Parent")).not.toBeChecked({ timeout: 5000 });
});
