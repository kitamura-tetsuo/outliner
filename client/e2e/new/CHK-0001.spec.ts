/** @feature CHK-0001
 *  Title   : Universal Checklist Component
 *  Source  : docs/client-features/chk-universal-checklist-*.yaml
 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("CHK-0001: Universal Checklist", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("add and archive item in shopping mode", async ({ page }) => {
        await page.goto("/checklist");
        await expect(page.locator('[data-testid="add-input"]')).toBeVisible();
        await page.locator('[data-testid="add-input"]').fill("Milk");
        await page.click('[data-testid="add-button"]');
        await expect(page.locator("li", { hasText: "Milk" })).toBeVisible();
        const checkbox = page.locator("li input[type='checkbox']").first();
        await checkbox.check();
        await expect(checkbox).toBeChecked();
    });

    test("reset unchecks items", async ({ page }) => {
        await page.goto("/checklist");
        await expect(page.locator('[data-testid="add-input"]')).toBeVisible();
        await page.locator('[data-testid="add-input"]').fill("Eggs");
        await page.click('[data-testid="add-button"]');
        const checkbox = page.locator("li input[type='checkbox']").first();
        await checkbox.check();
        await expect(checkbox).toBeChecked();
        await page.click('[data-testid="reset-button"]');
        await expect(checkbox).not.toBeChecked();
    });

    test("habit list auto resets", async ({ page }) => {
        await page.evaluate(() => {
            localStorage.setItem("CHK_MODE", "habit");
            localStorage.setItem("CHK_RRULE", "FREQ=SECONDLY;INTERVAL=1");
        });
        await page.goto("/checklist");
        await expect(page.locator('[data-testid="add-input"]')).toBeVisible();
        await page.locator('[data-testid="add-input"]').fill("Pushups");
        await page.click('[data-testid="add-button"]');
        const checkbox = page.locator("li input[type='checkbox']").first();
        await checkbox.check();
        await expect(checkbox).toBeChecked();
        await page.evaluate(() => new Promise(r => setTimeout(r, 1500)));
        await expect(checkbox).not.toBeChecked();
    });
});
