import { expect, test } from "@playwright/test";

test("Direct navigation to demo subpage", async ({ page }) => {
    await page.goto("/demo/Welcome");
    await expect(page.getByTestId("demo-page-toolbar")).toBeVisible({ timeout: 30000 });
});

test("Navigation among pages reuses client", async ({ page }) => {
    await page.goto("/demo/Welcome");
    await expect(page.getByTestId("demo-page-toolbar")).toBeVisible({ timeout: 30000 });

    // Navigate via Svelte routing link rather than page.goto to ensure we stay on the same SPA page
    await page.getByRole("link", { name: "Demo Project" }).click();
    await expect(page.getByTestId("demo-page-list")).toBeVisible({ timeout: 15000 });

    // Use locator that will actually find the link instead of a span inside it that might not be clickable
    await page.getByRole("link", { name: "Formatting" }).first().click();

    await expect(page.getByTestId("demo-page-toolbar")).toBeVisible({ timeout: 15000 });

    // We expect outliner content to load successfully since we're using the cached Yjs doc.
    await expect(page.getByTestId("outliner-base")).toBeVisible({ timeout: 15000 });
});
