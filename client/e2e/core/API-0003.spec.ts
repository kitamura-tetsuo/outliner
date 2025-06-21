import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

/**
 * @testcase 管理者チェック機能
 * @description /api/get-container-users が管理者のみアクセス可能であることを確認する
 */

test.describe("管理者チェック (API-0003)", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await TestHelpers.prepareTestEnvironment(page, testInfo);
  });

  test("非管理者は403が返る", async ({ page }) => {
    const response = await page.request.post("/api/get-container-users", {
      data: { idToken: "user-token", containerId: "dummy" },
    });
    expect(response.status()).toBe(403);
  });
});
