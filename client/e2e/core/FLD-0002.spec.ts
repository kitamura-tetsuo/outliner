import { expect, test } from '@playwright/test';
import { TestHelpers } from '../utils/testHelpers';
import { TreeValidator } from '../utils/treeValidation';

/**
 * FLD-0002: プロジェクトタイトルからFluidClientを取得する機能のテスト
 * 
 * このテストでは、プロジェクトタイトルからFluidClientインスタンスを取得する機能をテストします。
 * clientRegistryを走査して、Project.titleが一致するFluidClientを返すことを確認します。
 */
test.describe('FLD-0002: プロジェクトタイトルからFluidClientを取得する機能', () => {
    // テスト用のプロジェクトタイトル
    const testProjectTitle = `テスト用プロジェクト-${Date.now()}`;

    // テスト前の準備
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // ユーザーがログインしていることを確認

        expect(userManager.getCurrentUser()).not.toBeNull();

        // テスト用のプロジェクトを作成
        await createNewContainer(testProjectTitle);
    });

    test('プロジェクトタイトルからFluidClientインスタンスを取得できる', async () => {
        // プロジェクトタイトルからFluidClientを取得
        const fluidClient = await getFluidClientByProjectTitle(testProjectTitle);

        // FluidClientインスタンスが正しく取得できたことを確認
        expect(fluidClient).not.toBeNull();

        // プロジェクトデータにアクセスできることを確認
        const project = fluidClient!.getProject();
        expect(project).not.toBeNull();
        expect(project.title).toBe(testProjectTitle);
    });

    test('プロジェクトタイトルが指定されていない場合はエラーを返す', async () => {
        // 空のプロジェクトタイトルでFluidClientを取得しようとするとエラーになることを確認
        try {
            await getFluidClientByProjectTitle('');
            // エラーが発生しなかった場合はテスト失敗
            expect(true).toBe(false);
        } catch (error) {
            // エラーメッセージを確認
            expect(error.message).toBe('プロジェクトタイトルが指定されていません');
        }
    });

    test('プロジェクトタイトルに一致するFluidClientが見つからない場合はnullを返す', async () => {
        // 存在しないプロジェクトタイトルでFluidClientを取得
        const fluidClient = await getFluidClientByProjectTitle('存在しないプロジェクト');

        // nullが返されることを確認
        expect(fluidClient).toBeNull();
    });

    test('取得したFluidClientインスタンスを使用してプロジェクトデータにアクセスできる', async () => {
        // プロジェクトタイトルからFluidClientを取得
        const fluidClient = await getFluidClientByProjectTitle(testProjectTitle);

        // FluidClientインスタンスが正しく取得できたことを確認
        expect(fluidClient).not.toBeNull();

        // プロジェクトデータを取得
        const project = fluidClient!.getProject();
        expect(project).not.toBeNull();
        expect(project.title).toBe(testProjectTitle);

        const treeData = fluidClient!.getTreeAsJson();

        // プロジェクトデータの基本構造を検証
        expect(treeData.hasProperty('items')).toBe(true);
    });
});
