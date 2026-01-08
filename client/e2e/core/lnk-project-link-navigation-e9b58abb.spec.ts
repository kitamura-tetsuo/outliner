import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
registerCoverageHooks();
/** @feature LNK-0003
 *  Title   : 内部リンクのナビゲーション機能
 *  Source  : docs/client-features.yaml
 */
import { expect, test } from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";

test.describe("LNK-0003: 内部リンクのナビゲーション機能", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("プロジェクト内部リンクをクリックして遷移先のページ内容が正しく表示される", async ({ page }) => {
        // テスト用のプロジェクト名とページ名を生成
        const targetProjectName = "target-project-" + Date.now().toString().slice(-6);
        const targetPageName = "target-page-" + Date.now().toString().slice(-6);

        // 最初のアイテムにプロジェクト内部リンクを作成
        const firstItem = page.locator(".outliner-item").first();
        await firstItem.locator(".item-content").click({ force: true });
        await TestHelpers.waitForCursorVisible(page);

        // プロジェクト内部リンクを入力
        // Insert the link text in one step to avoid keyboard shortcuts dropping characters after '['
        await page.keyboard.insertText(`This is a link to [/${targetProjectName}/${targetPageName}]`);
        await page.waitForTimeout(500); // Ensure typing is processed

        // Press Enter to create a new item and potentially process the previous item
        await page.keyboard.press("Enter");
        await page.keyboard.type("Second item");

        // Move focus away from the first item to ensure it's no longer in editing mode
        // First click on the second item to shift focus
        const secondItemId = await TestHelpers.getItemIdByIndex(page, 1);
        expect(secondItemId).not.toBeNull();

        // Click the second item to shift focus from first item
        await page.locator(`.outliner-item[data-item-id="${secondItemId}"]`).locator(".item-content").click();

        // Wait for the update to propagate and for the first item to be rendered in non-editing mode
        await page.waitForTimeout(500);

        // Wait for the editor to become inactive - wait for the data-active attribute to change to "false"
        // or for the element to no longer have the data-active="true" attribute
        await expect(firstItem).not.toHaveAttribute("data-active", "true", { timeout: 8000 });

        // Check that the item-content no longer contains the .control-char elements
        await expect(firstItem.locator(".item-content .control-char")).not.toBeVisible({ timeout: 5000 });

        // Select the link element that was created
        const linkElement = firstItem.locator("a[href]").first();

        // リンクのhref属性を確認
        const linkHref = await linkElement.getAttribute("href");
        console.log(`Project link href: ${linkHref}`);
        expect(linkHref).toBe(`/${targetProjectName}/${targetPageName}`);

        // リンクがプロジェクトリンクのクラスを持っていることを確認
        const linkClass = await linkElement.getAttribute("class");
        expect(linkClass).toContain("project-link");

        console.log("Project link generation test completed successfully");

        await linkElement.click();
        await expect(page).toHaveURL(new RegExp(`${targetProjectName}/${targetPageName}`));
        const pageTitle = page.locator(".page-title-content .item-text");
        await expect(pageTitle).toBeVisible({ timeout: 5000 });
        await expect(pageTitle).toContainText(targetPageName);
    });
});
