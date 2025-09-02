import { expect, test } from "@playwright/test";

test.describe("TreeSubscriber Yjs<->Svelte5 双方向同期 (no server)", () => {
    test("input -> yText -> display", async ({ page }) => {
        await page.goto("/tests/treesubscriber");
        const display = page.getByTestId("display");
        const input = page.locator("#user-input");

        await expect(display).toHaveText("hello");
        await input.fill("world");
        await expect(display).toHaveText("world");
    });

    test("yText.insert -> display", async ({ page }) => {
        await page.goto("/tests/treesubscriber");
        const display = page.getByTestId("display");

        await expect(display).toHaveText("hello");
        await page.click("#append");
        await expect(display).toHaveText("hello!");
    });

    test("Reset", async ({ page }) => {
        await page.goto("/tests/treesubscriber");
        const display = page.getByTestId("display");

        await expect(display).toHaveText("hello");
        await page.click("#reset");
        await expect(display).toHaveText("RESET");
    });
});
