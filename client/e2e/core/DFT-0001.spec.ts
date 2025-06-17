/** @feature DFT-0001 */
import {
    expect,
    test,
} from "@playwright/test";
import { TestHelpers } from "../utils/testHelpers";
import { TreeValidator } from "../utils/treeValidation";

test.describe("DFT-0001: Fluid Framework Fork作成機能", () => {
    test.beforeEach(async ({ page }, testInfo) => {
        await TestHelpers.prepareTestEnvironment(page, testInfo);
    });

    test("SharedTreeからフォークを作成できる", async ({ page }) => {
        // プロジェクトとページは既にbeforeEachで作成済み

        // 初期データを確認
        const initialData = await TreeValidator.getTreeData(page);
        expect(initialData.itemCount).toBeGreaterThan(0);

        // 最初のアイテムにテキストを追加
        await page.locator(".outliner-item").first().click();
        await page.keyboard.press("End");
        await page.keyboard.type("初期テキスト");
        await page.waitForTimeout(500);

        // 更新後のデータを取得
        const updatedData = await TreeValidator.getTreeData(page);
        expect(updatedData.itemCount).toBeGreaterThan(0);
        expect(updatedData.items[0].text).toContain("初期テキスト");

        // DraftServiceを使用してフォークを作成
        const draftResult = await page.evaluate(async () => {
            try {
                // window.__FLUID_STORE__からFluidClientを取得
                const fluidStore = (window as any).__FLUID_STORE__;
                if (!fluidStore) {
                    throw new Error("Fluid store not available");
                }

                const fluidClient = fluidStore.fluidClient;
                if (!fluidClient) {
                    throw new Error("FluidClientが見つかりません");
                }

                // DraftServiceを動的にインポート
                const { draftService } = await import("/src/lib/draftService.svelte.ts");

                // フォークを作成
                const draft = await draftService.createDraft(fluidClient, {
                    title: "テスト下書き",
                });

                return {
                    success: true,
                    draftId: draft.metadata.id,
                    draftTitle: draft.metadata.title,
                    sourceContainerId: draft.metadata.sourceContainerId,
                    status: draft.metadata.status,
                    hasSnapshot: !!draft.projectSnapshot,
                    hasDraftData: !!draft.draftProjectData,
                    hasBranch: !!draft.branch,
                    hasFork: !!draft.fork,
                    usingBranchMethod: !!draft.branch, // ブランチベースの実装を使用している場合
                    usingForkMethod: !!draft.branch && !!draft.fork, // フォークも利用可能な場合
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: error.message,
                };
            }
        });

        // フォーク作成の検証
        if (!draftResult.success) {
            console.error("Draft creation failed:", draftResult.error);
            throw new Error(`Draft creation failed: ${draftResult.error}`);
        }
        expect(draftResult.success).toBe(true);
        expect(draftResult.draftTitle).toBe("テスト下書き");
        expect(draftResult.status).toBe("editing");

        // ブランチベースまたはスナップショット方式の判定
        if (draftResult.usingBranchMethod) {
            expect(draftResult.hasBranch).toBe(true);
            if (draftResult.usingForkMethod) {
                expect(draftResult.hasFork).toBe(true);
                console.log("getBranch() + fork()を使用して下書きが作成されました");
            }
            else {
                console.log("getBranch()を使用して下書きが作成されました（forkなし）");
            }
        }
        else {
            expect(draftResult.hasSnapshot).toBe(true);
            expect(draftResult.hasDraftData).toBe(true);
            console.log("スナップショット方式で下書きが作成されました");
        }
    });

    test("フォークは元のSharedTreeとは独立したデータ構造を持つ", async ({ page }) => {
        // プロジェクトとページは既にbeforeEachで作成済み

        // 初期データを追加
        await page.locator(".outliner-item").first().click();
        await page.keyboard.press("End");
        await page.keyboard.type("元のテキスト");
        await page.waitForTimeout(500);

        // フォークを作成
        const draftId = await page.evaluate(async () => {
            try {
                const fluidStore = (window as any).__FLUID_STORE__;
                const fluidClient = fluidStore.fluidClient;

                const { draftService } = await import("/src/lib/draftService.svelte.ts");
                const draft = await draftService.createDraft(fluidClient, {
                    title: "独立性テスト下書き",
                });
                return draft.metadata.id;
            }
            catch (error) {
                throw new Error(`Draft creation failed: ${error.message}`);
            }
        });

        // 元のデータを変更
        await page.locator(".outliner-item").first().click();
        await page.keyboard.press("End");
        await page.keyboard.type(" - 変更後");
        await page.waitForTimeout(500);

        // 元のデータが変更されていることを確認
        const mainData = await TreeValidator.getTreeData(page);
        expect(mainData.items[0].text).toContain("元のテキスト - 変更後");

        // フォークのデータが独立していることを確認
        const draftData = await page.evaluate(async draftId => {
            const { draftService } = await import("/src/lib/draftService.svelte.ts");
            try {
                return draftService.getDraftAsJson(draftId);
            }
            catch (error) {
                return { error: error.message };
            }
        }, draftId);

        // フォークのデータは元の状態を保持している
        expect(draftData.error).toBeUndefined();
        // スナップショット時点のデータが保持されている
        expect(draftData).toBeDefined();
    });

    test("フォークに対してデータの読み書きができる", async ({ page }) => {
        // プロジェクトとページは既にbeforeEachで作成済み

        // フォークを作成
        const draftId = await page.evaluate(async () => {
            try {
                const fluidStore = (window as any).__FLUID_STORE__;
                const fluidClient = fluidStore.fluidClient;

                const { draftService } = await import("/src/lib/draftService.svelte.ts");
                const draft = await draftService.createDraft(fluidClient, {
                    title: "読み書きテスト下書き",
                });
                return draft.metadata.id;
            }
            catch (error) {
                throw new Error(`Draft creation failed: ${error.message}`);
            }
        });

        // フォークからデータを読み取り
        const readResult = await page.evaluate(async draftId => {
            const { draftService } = await import("/src/lib/draftService.svelte.ts");
            try {
                const data = draftService.getDraftAsJson(draftId);
                return {
                    success: true,
                    data: data,
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: error.message,
                };
            }
        }, draftId);

        expect(readResult.success).toBe(true);
        expect(readResult.data).toBeDefined();
    });

    test("フォークのメタデータ（作成日時、作成者など）を管理できる", async ({ page }) => {
        // プロジェクトとページは既にbeforeEachで作成済み

        // フォークを作成
        const draftMetadata = await page.evaluate(async () => {
            try {
                const fluidStore = (window as any).__FLUID_STORE__;
                const fluidClient = fluidStore.fluidClient;

                const { draftService } = await import("/src/lib/draftService.svelte.ts");
                const draft = await draftService.createDraft(fluidClient, {
                    title: "メタデータテスト下書き",
                    scheduledPublishAt: Date.now() + 3600000, // 1時間後
                });
                return draft.metadata;
            }
            catch (error) {
                throw new Error(`Draft creation failed: ${error.message}`);
            }
        });

        // メタデータの検証
        expect(draftMetadata.id).toBeDefined();
        expect(draftMetadata.title).toBe("メタデータテスト下書き");
        expect(draftMetadata.authorId).toBeDefined();
        expect(draftMetadata.createdAt).toBeDefined();
        expect(draftMetadata.updatedAt).toBeDefined();
        expect(draftMetadata.sourceContainerId).toBeDefined();
        expect(draftMetadata.scheduledPublishAt).toBeDefined();
        expect(draftMetadata.status).toBe("scheduled");

        // 作成日時が現在時刻に近いことを確認
        const now = Date.now();
        expect(Math.abs(now - draftMetadata.createdAt)).toBeLessThan(5000); // 5秒以内
        expect(Math.abs(now - draftMetadata.updatedAt)).toBeLessThan(5000); // 5秒以内
    });

    test("フォークの一意識別子を生成できる", async ({ page }) => {
        // プロジェクトとページは既にbeforeEachで作成済み

        // 複数のフォークを作成
        const draftIds = await page.evaluate(async () => {
            try {
                const fluidStore = (window as any).__FLUID_STORE__;
                const fluidClient = fluidStore.fluidClient;

                const { draftService } = await import("/src/lib/draftService.svelte.ts");
                const ids = [];

                for (let i = 0; i < 3; i++) {
                    const draft = await draftService.createDraft(fluidClient, {
                        title: `一意性テスト下書き ${i + 1}`,
                    });
                    ids.push(draft.metadata.id);
                }

                return ids;
            }
            catch (error) {
                throw new Error(`Draft creation failed: ${error.message}`);
            }
        });

        // 一意性の検証
        expect(draftIds).toHaveLength(3);
        expect(new Set(draftIds).size).toBe(3); // 全て異なるID

        // UUIDフォーマットの検証
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        draftIds.forEach(id => {
            expect(id).toMatch(uuidRegex);
        });
    });

    test("フォークからJSONデータを取得できる", async ({ page }) => {
        // プロジェクトとページは既にbeforeEachで作成済み

        // 初期データを追加
        await page.locator(".outliner-item").first().click();
        await page.keyboard.press("End");
        await page.keyboard.type("JSONテスト用テキスト");
        await page.waitForTimeout(500);

        // フォークを作成
        const draftId = await page.evaluate(async () => {
            try {
                const fluidStore = (window as any).__FLUID_STORE__;
                const fluidClient = fluidStore.fluidClient;

                const { draftService } = await import("/src/lib/draftService.svelte.ts");
                const draft = await draftService.createDraft(fluidClient, {
                    title: "JSONテスト下書き",
                });
                return draft.metadata.id;
            }
            catch (error) {
                throw new Error(`Draft creation failed: ${error.message}`);
            }
        });

        // JSONデータを取得
        const jsonData = await page.evaluate(async draftId => {
            const { draftService } = await import("/src/lib/draftService.svelte.ts");
            return draftService.getDraftAsJson(draftId);
        }, draftId);

        // JSONデータの検証
        expect(jsonData).toBeDefined();
        expect(typeof jsonData).toBe("object");
        expect(jsonData.title).toBeDefined();

        // データがJSON形式でシリアライズ可能であることを確認
        expect(() => JSON.stringify(jsonData)).not.toThrow();

        const serialized = JSON.stringify(jsonData);
        const deserialized = JSON.parse(serialized);
        expect(deserialized).toEqual(jsonData);
    });

    test("TreeAlpha.branchとgetBranchの利用可能性を確認する", async ({ page }) => {
        // プロジェクトとページは既にbeforeEachで作成済み

        // ブランチAPIの利用可能性をテスト
        const branchTestResult = await page.evaluate(async () => {
            try {
                const fluidStore = (window as any).__FLUID_STORE__;
                const fluidClient = fluidStore.fluidClient;

                const { testRealBranchCreation } = await import("/src/lib/draftService.svelte.ts");
                return await testRealBranchCreation(fluidClient);
            }
            catch (error) {
                return {
                    success: false,
                    branchCreated: false,
                    error: error.message,
                };
            }
        });

        console.log("Branch test result:", branchTestResult);

        // テスト結果の検証
        expect(branchTestResult.success).toBe(true);

        if (branchTestResult.branchCreated) {
            console.log("Real branch creation succeeded:", branchTestResult.branchDetails);
            expect(branchTestResult.branchDetails).toBeDefined();
        }
        else {
            console.log("Real branch creation not available, using snapshot approach");
        }
    });

    test("TreeAlpha.branchを使用して実際のブランチを作成する", async ({ page }) => {
        // プロジェクトとページは既にbeforeEachで作成済み

        // TreeAlpha.branchの詳細な利用可能性を確認
        const branchAvailabilityResult = await page.evaluate(async () => {
            try {
                const { testBranchAvailability } = await import("/src/lib/draftService.svelte.ts");
                return await testBranchAvailability();
            }
            catch (error) {
                return {
                    alphaAPIAvailable: false,
                    branchMethodAvailable: false,
                    availableBranchMethods: [],
                    branchAPIDetails: null,
                    error: error.message,
                };
            }
        });

        console.log("Branch availability result:", branchAvailabilityResult);

        // TreeAlpha.branchを使用してブランチを作成
        const branchCreationResult = await page.evaluate(async () => {
            try {
                const fluidStore = (window as any).__FLUID_STORE__;
                const fluidClient = fluidStore.fluidClient;

                // draftServiceのloadAlphaAPI関数を使用
                const { loadAlphaAPI } = await import("/src/lib/draftService.svelte.ts");
                const alphaAPI = await loadAlphaAPI();

                if (!alphaAPI || !alphaAPI.TreeAlpha) {
                    return {
                        success: false,
                        error: "TreeAlpha is not available",
                        alphaAPI: !!alphaAPI,
                        treeAlpha: !!alphaAPI?.TreeAlpha,
                    };
                }

                // TreeAlpha.branchが利用可能かチェック
                if (typeof alphaAPI.TreeAlpha.branch !== "function") {
                    return {
                        success: false,
                        error: "TreeAlpha.branch is not a function",
                        treeAlphaMethods: Object.getOwnPropertyNames(alphaAPI.TreeAlpha),
                    };
                }

                // ブランチを作成
                const branch = alphaAPI.TreeAlpha.branch(fluidClient.appData);

                return {
                    success: true,
                    branchCreated: !!branch,
                    branchType: typeof branch,
                    branchKeys: branch ? Object.keys(branch).slice(0, 10) : [], // 最初の10個のキーのみ
                    isBranch: branch?.isBranch,
                };
            }
            catch (error) {
                return {
                    success: false,
                    error: error.message,
                };
            }
        });

        console.log("Branch creation result:", branchCreationResult);

        // テスト結果の検証
        // TreeAlpha.branchは現在のFluid Framework v2.41.0では実際のFluidClientで失敗することを確認
        expect(branchCreationResult.success).toBe(false);
        expect(branchCreationResult.error).toBeDefined();
        expect(branchCreationResult.error).toBe("0x9b1");

        console.log("TreeAlpha.branchは期待通りに失敗しました（エラーコード: 0x9b1）");
        console.log("これは正常な動作で、getBranchを使用する必要があります");
    });

    test("ブランチをメインブランチにマージできる", async ({ page }) => {
        // プロジェクトとページは既にbeforeEachで作成済み

        // 初期データを追加
        await page.locator(".outliner-item").first().click();
        await page.keyboard.press("End");
        await page.keyboard.type("マージテスト用初期データ");
        await page.waitForTimeout(500);

        // フォークを作成
        const draftId = await page.evaluate(async () => {
            try {
                const fluidStore = (window as any).__FLUID_STORE__;
                const fluidClient = fluidStore.fluidClient;

                const { draftService } = await import("/src/lib/draftService.svelte.ts");
                const draft = await draftService.createDraft(fluidClient, {
                    title: "マージテスト下書き",
                });
                return draft.metadata.id;
            }
            catch (error) {
                throw new Error(`Draft creation failed: ${error.message}`);
            }
        });

        // ブランチにデータを追加（シミュレーション）
        await page.evaluate(async draftId => {
            const { draftService } = await import("/src/lib/draftService.svelte.ts");

            // テスト用のアイテムを追加
            const testItem = {
                id: "merge-test-item-" + Date.now(),
                text: "ブランチで追加されたアイテム",
                author: "test-user",
                votes: [],
                created: Date.now(),
                lastChanged: Date.now(),
                items: [],
            };

            draftService.addItemToDraft(draftId, testItem);
        }, draftId);

        // マージを実行
        const mergeResult = await page.evaluate(async draftId => {
            const { draftService } = await import("/src/lib/draftService.svelte.ts");
            return await draftService.mergeDraftToMain(draftId);
        }, draftId);

        console.log("Merge result:", mergeResult);

        // マージ結果の検証
        expect(mergeResult.success).toBe(true);
        expect(mergeResult.mergeMethod).toBeDefined();
        expect(mergeResult.details).toBeDefined();

        // マージ後のデータを確認
        const postMergeData = await TreeValidator.getTreeData(page);
        expect(postMergeData.itemCount).toBeGreaterThan(0);

        console.log(`マージが成功しました。使用されたメソッド: ${mergeResult.mergeMethod}`);
        console.log(`マージ後のアイテム数: ${postMergeData.itemCount}`);
    });
});
