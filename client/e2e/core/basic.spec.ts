import {
    expect,
    test,
} from "@playwright/test";

/**
 * @playwright
 * @title 基本テスト
 */

test("ホームページが正常に表示される", async ({ page }) => {
    // FluidClientをモック化するスクリプトを挿入
    await page.addInitScript(() => {
        window.mockFluidClient = true;
    });

    await page.goto("/");

    // タイトルが表示されることを確認
    await expect(page.locator("h1")).toContainText("Fluid Outliner App");

    // 認証コンポーネントが表示されることを確認
    await expect(page.locator(".auth-section")).toBeVisible();
});
