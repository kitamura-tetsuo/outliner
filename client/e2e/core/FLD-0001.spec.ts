import { expect, test } from '@playwright/test';
import { TestHelpers } from '../utils/testHelpers';

/**
 * FLD-0001: プロジェクト名からFluidClientを取得する機能のテスト
 * 
 * このテストでは、プロジェクト名からFluidClientインスタンスを取得する機能をテストします。
 * プロジェクト名をコンテナIDとして使用し、対応するFluidClientインスタンスを取得できることを確認します。
 */
test.describe('FLD-0001: プロジェクト名からFluidClientを取得する機能', () => {
    // テスト用のプロジェクト名
    const testProjectName = `test-project-${Date.now()}`;

    // テスト前の準備
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // ユーザーがログインしていることを確認

        expect(userManager.getCurrentUser()).not.toBeNull();
    });

    test('プロジェクト名からFluidClientインスタンスを取得できる', async () => {
        // プロジェクト名からFluidClientを取得
        const fluidClient = await getFluidClientByProjectTitle(testProjectName);

        // FluidClientインスタンスが正しく取得できたことを確認
        expect(fluidClient).not.toBeNull();
        expect(fluidClient.containerId).toBe(testProjectName);

        // プロジェクトデータにアクセスできることを確認
        const project = fluidClient.getProject();
        expect(project).not.toBeNull();
    });

    test('プロジェクト名が指定されていない場合はエラーを返す', async () => {
        // 空のプロジェクト名でFluidClientを取得しようとするとエラーになることを確認
        try {
            await getFluidClientByProjectTitle('');
            // エラーが発生しなかった場合はテスト失敗
            expect(true).toBe(false);
        } catch (error) {
            // エラーメッセージを確認
            expect(error.message).toBe('プロジェクト名が指定されていません');
        }
    });

    test('取得したFluidClientインスタンスを使用してプロジェクトデータにアクセスできる', async ({ page }) => {
        // プロジェクト名からFluidClientを取得
        const fluidClient = await getFluidClientByProjectTitle(testProjectName);
        expect(fluidClient).not.toBeUndefined();

        // プロジェクトデータを取得
        const project = fluidClient!.getProject();
        expect(project).not.toBeNull();

        const treeData = fluidClient!.getTreeAsJson();

        // プロジェクトデータの基本構造を検証
        expect(treeData.hasProperty('items')).toBe(true);
    });

    test('プロジェクトレイアウトでこの機能を使用してプロジェクトデータを読み込める', async ({ page }) => {
        // プロジェクトページに移動
        await page.goto(`/${testProjectName}`);

        // ページが正しく読み込まれたことを確認
        await expect(page).toHaveURL(new RegExp(`/${testProjectName}`));

        // プロジェクトデータが読み込まれるまで待機
        await page.waitForSelector('.project-container', { timeout: 10000 });

        // プロジェクトデータが正しく表示されていることを確認
        const projectTitle = await page.locator('.project-title').textContent();
        expect(projectTitle).not.toBeNull();
    });
});
