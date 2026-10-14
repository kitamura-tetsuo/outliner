import { expect, test } from "@playwright/test";
import { createProject, login, stackFor } from "./helpers";
import type { OnPremProductionStack } from "./onpremProductionStack";

test.describe("production on-premises workspace", () => {
    let stack: OnPremProductionStack;
    test.beforeAll(async ({}, testInfo) => {
        stack = stackFor(testInfo);
        await stack.start();
    });
    test.afterAll(async () => stack.stop());

    test("uses password sessions and canonical project registration, outline, reload, and rename", async ({ page }) => {
        await login(page, stack, "wrong password");
        await expect(page.getByText("Incorrect password")).toBeVisible();

        await login(page, stack);
        await expect(page.getByText("No available projects")).toBeVisible();
        const title = `Local-${Date.now()}`;
        await createProject(page, title);

        await page.getByLabel("New page name").fill("Inbox");
        await page.getByRole("button", { name: "Create new page" }).click();
        await page.getByRole("link", { name: "Inbox" }).click();
        const firstItem = page.locator(".outliner-item").first();
        await expect(firstItem).toBeVisible();
        await firstItem.click();
        await page.keyboard.type("Persistent outline");
        await page.keyboard.press("Enter");
        await page.keyboard.type("Nested item");

        await page.reload();
        await expect(page.getByText("Persistent outline")).toBeVisible();
        await expect(page.getByText("Nested item")).toBeVisible();

        await page.goto(`${stack.origin}/${encodeURIComponent(title)}/-/settings`);
        await page.getByLabel("Project Title").fill(`${title}-renamed`);
        await page.getByRole("button", { name: "Save Changes" }).click();
        await expect(page).toHaveURL(new RegExp(`${encodeURIComponent(title)}-renamed/-/settings$`));
        await page.goto(stack.origin);
        await expect(page.locator("select.project-select option", { hasText: `${title}-renamed` })).toHaveCount(1);
    });
});
