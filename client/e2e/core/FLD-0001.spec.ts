/** @feature FLD-0001 */
import {
    expect,
    test,
} from "@playwright/test";
import {
    FluidServiceHelper,
    TestHelpers,
} from "../utils/testHelpers";

/**
 * FLD-0001: プロジェクトタイトルからFluidClientを取得する機能のテスト
 *
 * このテストでは、プロジェクトタイトルからFluidClientインスタンスを取得する機能をテストします。
 * プロジェクトタイトルに基づいて対応するFluidClientインスタンスを取得できることを確認します。
 */
test.describe("FLD-0001: プロジェクトタイトルからFluidClientを取得する機能", () => {
    // テスト用のプロジェクトタイトル
    const testProjectTitle = `test-project-${Date.now()}`;

    // テスト前の準備
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);

        // ユーザーがログインしていることを確認
        const currentUser = await FluidServiceHelper.getCurrentUser(page);
        expect(currentUser).not.toBeNull();
    });

    test("プロジェクトタイトルからFluidClientインスタンスを取得できる", async ({ page }) => {
        // テスト用のプロジェクトを作成
        await FluidServiceHelper.createNewContainer(page, testProjectTitle);

        // プロジェクトタイトルからFluidClientを取得
        const fluidClientInfo = await FluidServiceHelper.getFluidClientByProjectTitle(page, testProjectTitle);

        // FluidClientインスタンスが正しく取得できたことを確認
        expect(fluidClientInfo).not.toBeNull();
        expect(fluidClientInfo.containerId).toBeDefined();

        // プロジェクトデータにアクセスできることを確認
        expect(fluidClientInfo.project).not.toBeNull();
        expect(fluidClientInfo.project.title).toBe(testProjectTitle);
    });

    test("プロジェクトタイトルが指定されていない場合はエラーを返す", async ({ page }) => {
        // 空のプロジェクトタイトルでFluidClientを取得しようとするとエラーになることを確認
        try {
            await FluidServiceHelper.getFluidClientByProjectTitle(page, "");
            // エラーが発生しなかった場合はテスト失敗
            expect(true).toBe(false);
        }
        catch (error) {
            // エラーメッセージを確認（page.evaluateのエラーメッセージ形式を考慮）
            expect(error.message).toContain("プロジェクトタイトルが指定されていません");
        }
    });

    test("プロジェクトタイトルに一致するFluidClientが見つからない場合はundefinedを返す", async ({ page }) => {
        // 存在しないプロジェクトタイトルでFluidClientを取得
        const fluidClientInfo = await FluidServiceHelper.getFluidClientByProjectTitle(page, "存在しないプロジェクト");

        // undefinedが返されることを確認
        expect(fluidClientInfo).toBeUndefined();
    });

    test("取得したFluidClientインスタンスを使用してプロジェクトデータにアクセスできる", async ({ page }) => {
        // テスト用のプロジェクトを作成
        await FluidServiceHelper.createNewContainer(page, testProjectTitle);

        // プロジェクトタイトルからFluidClientを取得
        const fluidClientInfo = await FluidServiceHelper.getFluidClientByProjectTitle(page, testProjectTitle);
        expect(fluidClientInfo).not.toBeUndefined();

        // プロジェクトデータを取得
        expect(fluidClientInfo.project).not.toBeNull();
        expect(fluidClientInfo.project.title).toBe(testProjectTitle);

        // プロジェクトデータの基本構造を検証
        expect(fluidClientInfo.treeData.hasOwnProperty("items")).toBe(true);
    });

    test("プロジェクトレイアウトでこの機能を使用してプロジェクトデータを読み込める", async ({ page }) => {
        // テスト用のプロジェクトを作成
        await FluidServiceHelper.createNewContainer(page, testProjectTitle);

        // プロジェクトタイトルからFluidClientを取得
        const fluidClientInfo = await FluidServiceHelper.getFluidClientByProjectTitle(page, testProjectTitle);
        expect(fluidClientInfo).not.toBeNull();

        // FluidClientが正しく初期化されていることを確認
        expect(fluidClientInfo.containerId).toBeDefined();

        // プロジェクトデータが正しく設定されていることを確認
        expect(fluidClientInfo.project).not.toBeNull();
        expect(fluidClientInfo.project.title).toBe(testProjectTitle);
    });
});
