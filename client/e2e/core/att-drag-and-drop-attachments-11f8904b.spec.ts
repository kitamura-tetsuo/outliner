/** @feature ATT-0001 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("ATT-0001: Drag and drop attachments", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        // コンソールログを取得
        page.on("console", msg => console.log("PAGE LOG:", msg.text()));
        page.on("pageerror", error => console.log("PAGE ERROR:", error.message));

        await TestHelpers.prepareTestEnvironment(page, testInfo);
        const first = page.locator(".outliner-item").first();
        await first.locator(".item-content").click({ force: true });
        await page.keyboard.type("Drop here");
    });

    test("attachment preview appears", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        const content = item.locator(".item-content");
        const data = await page.evaluateHandle(() => new DataTransfer());
        await data.evaluate(dt => {
            const blob = new Blob(["hello"], { type: "text/plain" });
            const file = new File([blob], "hello.txt", { type: "text/plain" });
            dt.items.add(file);
        });
        await content.dispatchEvent("drop", { dataTransfer: data });
        await page.waitForTimeout(1000);
        await expect(item.locator(".attachment-preview")).toBeVisible();
    });

    test("multiple attachments can be added to same item", async ({ page }) => {
        const item = page.locator(".outliner-item").first();
        const content = item.locator(".item-content");

        // 最初のファイルをドロップ
        const data1 = await page.evaluateHandle(() => new DataTransfer());
        await data1.evaluate(dt => {
            const blob = new Blob(["world"], { type: "text/plain" });
            const file = new File([blob], "world.txt", { type: "text/plain" });
            dt.items.add(file);
        });
        await content.dispatchEvent("drop", { dataTransfer: data1 });
        await page.waitForTimeout(1000);

        // 最初の添付ファイルが表示されることを確認
        await expect(item.locator(".attachment-preview")).toBeVisible();

        // 2つ目のファイルをドロップ
        const data2 = await page.evaluateHandle(() => new DataTransfer());
        await data2.evaluate(dt => {
            const blob = new Blob(["hello again"], { type: "text/plain" });
            const file = new File([blob], "hello2.txt", { type: "text/plain" });
            dt.items.add(file);
        });
        await content.dispatchEvent("drop", { dataTransfer: data2 });
        await page.waitForTimeout(1000);

        // 2つの添付ファイルが表示されることを確認
        await expect(item.locator(".attachment-preview")).toHaveCount(2);
    });
});
