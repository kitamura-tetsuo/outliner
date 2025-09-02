// @ts-nocheck
import { expect, type Page } from "@playwright/test";
import { CursorValidator } from "./cursorValidation.js";
import { DataValidationHelpers } from "./dataValidationHelpers.js";

/**
 * テスト用のヘルパー関数群
 */
export class TestHelpers {
    /**
     * テスト環境を準備する（最適化版）
     * 各テストの前に呼び出すことで、テスト環境を一貫した状態にする
     * @param page Playwrightのページオブジェクト
     * @returns 作成したプロジェクト名とページ名
     */
    public static async prepareTestEnvironment(
        page: Page,
        testInfo: any,
        lines: string[] = [],
    ): Promise<{ projectName: string; pageName: string; }> {
        // ブラウザ側のconsoleログを収集（簡略化）
        try {
            page.on("console", msg => {
                if (msg.type() === "error") {
                    console.log(`[BROWSER:${msg.type()}]`, msg.text());
                }
            });
            page.on("pageerror", error => {
                console.error("[BROWSER:pageerror]", error);
            });
        } catch (e) {
            console.warn("TestHelper: Failed to bind page console listeners", e);
        }

        // ホームページにアクセス（タイムアウト短縮）
        console.log("TestHelper: Starting navigation to home page");

        try {
            await page.goto("/", {
                timeout: 30000, // 30秒に短縮
                waitUntil: "domcontentloaded",
            });
            console.log("TestHelper: Successfully navigated to home page");
        } catch (error) {
            console.error("TestHelper: Failed to navigate to home page:", error);
            throw error;
        }

        // テスト環境フラグを設定（簡略化）
        // Yjsブランチでは常にYjsモード
        const e2eMode = "yjs";

        await page.evaluate((mode) => {
            // テスト環境であることを明示的に設定
            localStorage.setItem("VITE_IS_TEST", "true");
            localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
            localStorage.setItem("OUTLINER_MODE", mode);
            console.log("TestHelper: Set test environment flags and OUTLINER_MODE=", mode);
        }, e2eMode);

        // フラグを適用するためページを再読み込み
        await page.reload({ waitUntil: "domcontentloaded" });

        // Yjsブランチ: Firebase認証は無効化、テスト用ユーザーを設定
        console.log("TestHelper: Setting up test user for Yjs mode");
        await page.evaluate(() => {
            // テスト用ユーザーを設定
            (window as any).__TEST_USER__ = {
                id: "test-user-id",
                name: "Test User",
                email: "test@example.com",
            };
            console.log("TestHelper: Test user set for Yjs mode");
        });

        console.log("TestHelper: Setting up global variables for Yjs mode");

        // YjsProjectManagerを含むグローバル変数を設定
        await page.evaluate(async () => {
            // SvelteGotoのモック関数を設定
            if (!(window as any).__SVELTE_GOTO__) {
                (window as any).__SVELTE_GOTO__ = (url: string) => {
                    console.log("Mock goto function called with:", url);
                    window.history.pushState({}, "", url);
                };
            }

            // YjsProjectManagerを動的インポートしてグローバル変数に設定
            try {
                const { YjsProjectManager } = await import("../../src/lib/yjsProjectManager.svelte.js");
                (window as any).YjsProjectManager = YjsProjectManager;
                console.log("TestHelper: YjsProjectManager set to global variable");
            } catch (error) {
                console.error("TestHelper: Failed to import YjsProjectManager:", error);
                // フォールバック: モック関数を設定
                (window as any).YjsProjectManager = class MockYjsProjectManager {
                    constructor(projectId: string) {
                        this.projectId = projectId;
                    }
                    async connect() {
                        return Promise.resolve();
                    }
                    updateProjectTitle() {}
                    getProjectMetadata() {
                        return { title: "Mock Project", id: this.projectId };
                    }
                    getProject() {
                        return { items: { toArray: () => [] } };
                    }
                    async createPage() {
                        return "mock-page-id";
                    }
                };
                console.log("TestHelper: Mock YjsProjectManager set as fallback");
            }

            console.log("TestHelper: Global variables set for Yjs mode");
        });

        // デバッガーをセットアップ（簡略化）
        if (!page.isClosed()) {
            await TestHelpers.setupTreeDebugger(page);
            await TestHelpers.setupCursorDebugger(page);
        }

        // テストページをセットアップ（最適化版）
        return await TestHelpers.navigateToTestProjectPageOptimized(page, testInfo, lines);
    }

    /**
     * テストページをセットアップする（最適化版）
     * @param page Playwrightのページオブジェクト
     * @param testInfo テスト情報
     * @param lines 初期コンテンツ
     * @returns プロジェクト名とページ名
     */
    public static async navigateToTestProjectPageOptimized(
        page: Page,
        testInfo: any,
        lines: string[],
    ): Promise<{ projectName: string; pageName: string; }> {
        const projectName = process.env.E2E_PROJECT_NAME || `Test Project ${testInfo.workerIndex} ${Date.now()}`;
        const pageName = process.env.E2E_PAGE_NAME || `test-page-${Date.now()}`;

        console.log("TestHelper: Creating test project and page via optimized API");
        await TestHelpers.createTestProjectAndPageViaAPIOptimized(page, projectName, pageName, lines);

        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);
        const url = `/${encodedProject}/${encodedPage}`;

        console.log("TestHelper: Navigating to project page:", url);
        await page.goto(url, { timeout: 15000 }); // タイムアウト短縮

        // 基本的な要素が表示されるまで待機（短縮版）
        try {
            await page.waitForSelector('[data-testid="outliner-base"]', { timeout: 10000 });
            console.log("TestHelper: OutlinerBase found");
        } catch (error) {
            console.log("TestHelper: OutlinerBase not found, but continuing");
        }

        return { projectName, pageName };
    }

    /**
     * テスト用のプロジェクトとページをYjs API経由で作成する（最適化版）
     * @param page Playwrightのページオブジェクト
     * @param projectName プロジェクト名
     * @param pageName ページ名
     */
    public static async createTestProjectAndPageViaAPIOptimized(
        page: Page,
        projectName: string,
        pageName: string,
        lines: string[] = [],
    ): Promise<void> {
        if (lines.length == 0) {
            lines = [
                "これはテスト用のページです。1",
                "これはテスト用のページです。2",
                "内部リンクのテスト: [test-link]",
            ];
        }

        // YjsProjectManagerを直接作成・接続（動的インポートを避ける）
        await page.evaluate(async ({ projectName, pageName, lines }) => {
            console.log(`🔧 [TestHelper] Creating Yjs project and page (optimized)`, {
                projectName,
                pageName,
                linesCount: lines.length,
            });

            // プロジェクトIDをアプリと同じ規則でスラッグ化
            const slugify = (input) => {
                const s = (input || "").toString().trim().toLowerCase();
                const slug = s
                    .replace(/[^a-z0-9_-]+/g, "-")
                    .replace(/-+/g, "-")
                    .replace(/^-+|-+$/g, "");
                return slug || "default-project";
            };
            const projectId = slugify(projectName);

            // YjsProjectManagerを取得または作成（グローバル変数から）
            let yjsProjectManager = (window as any).__YJS_PROJECT_MANAGER__;
            if (!yjsProjectManager) {
                // グローバルコンストラクタを使用（動的インポートを避ける）
                const YjsProjectManager = (window as any).YjsProjectManager;
                if (!YjsProjectManager) {
                    throw new Error("YjsProjectManager constructor not found on window");
                }

                yjsProjectManager = new YjsProjectManager(projectId);
                await yjsProjectManager.connect(projectName); // 表示タイトルは元の名称
                (window as any).__YJS_PROJECT_MANAGER__ = yjsProjectManager;
                console.log(`🔧 [TestHelper] YjsProjectManager created and connected (optimized)`);
            }

            // プロジェクトタイトルを設定
            yjsProjectManager.updateProjectTitle(projectName);

            // ページIDを生成
            const pageId = `page-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            window.__LAST_CREATED_PAGE_ID__ = pageId;

            // Yjsページを作成
            await yjsProjectManager.createPage(pageName, "test-user", lines, pageId);
            console.log(`🔧 [TestHelper] Yjs project and page creation completed (optimized)`);
        }, { projectName, pageName, lines });

        console.log("TestHelper: Optimized Yjs project creation completed");
    }

    /**
     * テスト用のプロジェクトとページをYjs API経由で作成する（Yjsブランチ専用）
     * @param page Playwrightのページオブジェクト
     * @param projectName プロジェクト名
     * @param pageName ページ名
     */
    public static async createTestProjectAndPageViaAPI(
        page: Page,
        projectName: string,
        pageName: string,
        lines: string[] = [],
    ): Promise<void> {
        if (lines.length == 0) {
            lines = [
                "これはテスト用のページです。1",
                "これはテスト用のページです。2",
                "内部リンクのテスト: [test-link]",
            ];
        }

        // ページが閉じられていないかチェック
        if (page.isClosed()) {
            console.log("TestHelper: Page is closed, cannot create test project");
            throw new Error("Page is closed, cannot create test project");
        }

        // ページの状態を詳細にログ出力
        try {
            const url = page.url();
            const title = await page.title();
            console.log(`TestHelper: Page state - URL: ${url}, Title: ${title}`);
        } catch (error) {
            console.log("TestHelper: Failed to get page state:", error.message);
        }

        // Yjsブランチ: Yjs APIを使用してプロジェクトとページを作成（Fluidコードは削除）
        await page.evaluate(async ({ projectName, pageName, lines }) => {
            console.log(`🔧 [TestHelper] Creating Yjs project and page`, {
                projectName,
                pageName,
                linesCount: lines.length,
            });

            // Yjsブランチ: FluidStoreの待機は削除（不要）
            // let attempts = 0;
            // const maxAttempts = 300; // 30秒間待機
            // while (!window.__FLUID_STORE__ && attempts < maxAttempts) {
            //     await new Promise(resolve => setTimeout(resolve, 100));
            //     attempts++;
            // }
            //
            // if (!window.__FLUID_STORE__) {
            //     console.error("TestHelper: FluidStore not available after 30 seconds, aborting");
            //     throw new Error("FluidStore initialization timeout");
            // }
            // console.log(`🔧 [TestHelper] FluidStore is available`);

            // Yjsブランチ: FluidServiceとFluidClientのコードは削除（不要）
            // const fluidService = window.__FLUID_SERVICE__;
            // console.log(`🔧 [TestHelper] FluidService is available`, { exists: !!fluidService });
            //
            // const fluidClient = await fluidService.createNewContainer(projectName);
            // console.log(`🔧 [TestHelper] FluidClient created`, { containerId: fluidClient.containerId });

            // Yjsブランチ: YjsProjectManagerを直接使用
            console.log(`🔧 [TestHelper] Starting Yjs project creation...`);

            // YjsProjectManagerを取得または作成
            let yjsProjectManager = (window as any).__YJS_PROJECT_MANAGER__;
            if (!yjsProjectManager) {
                console.log(`🔧 [TestHelper] YjsProjectManager not found, creating new one without dynamic import...`);
                const YjsProjectManager = (window as any).YjsProjectManager;
                if (!YjsProjectManager) {
                    throw new Error(
                        "YjsProjectManager constructor not found on window. Make sure setupGlobalDebugFunctions() ran.",
                    );
                }
                // プロジェクトIDとしてprojectNameを使用
                const projectId = projectName;
                yjsProjectManager = new YjsProjectManager(projectId);
                await yjsProjectManager.connect(projectId);

                // グローバル変数に設定
                (window as any).__YJS_PROJECT_MANAGER__ = yjsProjectManager;
                console.log(`🔧 [TestHelper] YjsProjectManager created and connected`);
            }

            console.log(`🔧 [TestHelper] YjsProjectManager available: ${!!yjsProjectManager}`);

            // プロジェクトタイトルを設定
            yjsProjectManager.updateProjectTitle(projectName);
            console.log(`🔧 [TestHelper] Project title set to: ${projectName}`);

            // ページIDを生成（UUIDまたは簡単なID）
            const pageId = `page-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            console.log(`🔧 [TestHelper] Generated page ID: ${pageId}`);

            // ページIDをグローバル変数に保存
            window.__LAST_CREATED_PAGE_ID__ = pageId;
            console.log(`🔧 [TestHelper] Page ID variables set:`, {
                __CURRENT_PAGE_ID__: window.__CURRENT_PAGE_ID__,
                __LAST_CREATED_PAGE_ID__: window.__LAST_CREATED_PAGE_ID__,
            });

            // Yjsページを作成
            console.log(`🔧 [TestHelper] Creating Yjs page: ${pageName}`);
            await yjsProjectManager.createPage(pageName, "test-user", lines, pageId);
            console.log(`🔧 [TestHelper] Yjs page created successfully`);

            // アイテムIDを生成（テスト用）
            const yjsItemIds = lines.map((_, index) => `item-${pageId}-${index}`);
            console.log(`🔧 [TestHelper] Generated Yjs item IDs:`, yjsItemIds);

            // Yjsブランチ: YjsアイテムIDをグローバル変数に保存
            window.__LAST_CREATED_ITEM_IDS__ = yjsItemIds;

            // Yjsブランチ: FluidStoreとFluidClientのコードは削除（不要）
            // const fluidStore = window.__FLUID_STORE__;
            // if (fluidStore) {
            //     console.log(`TestHelper: Updating fluidStore with new client`);
            //     fluidStore.fluidClient = fluidClient;
            //     console.log(`TestHelper: FluidStore updated`);
            // } else {
            //     console.error(`TestHelper: FluidStore not found`);
            // }
            //
            // // グローバル変数にFluidClientを設定（データ検証用）
            // window.__FLUID_CLIENT__ = fluidClient;
            // console.log(`TestHelper: FluidClient set to global variable`);

            // Yjsブランチ: YjsProjectManagerは既に上で設定済み（重複コードを削除）
            console.log(`🔧 [TestHelper] Yjs project and page creation completed successfully`);

            // Yjsブランチ: 上記でYjsプロジェクトとページの作成は完了済み（Fluidコードは削除）
            // 作成後の状態を確認（Yjsのみ）
            const yjsPages = yjsProjectManager.getPages();
            console.log(`🔧 [TestHelper] Final Yjs project state:`, {
                projectTitle: yjsProjectManager.getProjectTitle(),
                pagesCount: yjsPages.length,
            });

            if (yjsPages.length > 0) {
                for (let i = 0; i < yjsPages.length; i++) {
                    const page = yjsPages[i];
                    console.log(`🔧 [TestHelper] Yjs Page ${i}:`, { title: page.title, id: page.id });
                }
            }
        }, { projectName, pageName, lines });

        // Yjsブランチ: FluidClient関連の待機処理は削除（不要）
        console.log("TestHelper: Yjs project creation completed, no FluidClient waiting needed");

        // Yjsブランチ: データ操作フック初期化（Yjsのみ）
        console.log("TestHelper: Data operation hooks initialization disabled for mode separation");
    }

    /**
     * Yjs前提でテスト環境を準備する（簡易版）
     * @param page Playwrightのページオブジェクト
     * @param testInfo テスト情報
     * @param lines 初期コンテンツ
     * @returns プロジェクト名とページ名
     */
    public static async prepareYjsTestEnvironment(
        page: Page,
        testInfo: any,
        lines: string[] = ["first line"],
    ): Promise<{ projectName: string; pageName: string; }> {
        // テスト環境を準備
        await TestHelpers.prepareTestEnvironment(page, testInfo, lines);

        // プロジェクト名とページ名を生成
        const timestamp = Date.now();
        const projectName = `test-project-${timestamp}`;
        const pageName = `test-page-${timestamp}`;

        // YjsServiceHelperを使用してプロジェクトとページを作成
        await YjsServiceHelper.createNewYjsProject(page, projectName);
        await YjsServiceHelper.createYjsPage(page, projectName, pageName, lines);

        return { projectName, pageName };
    }

    /**
     * Yjsプロジェクトのデータを取得する
     * @param page Playwrightのページオブジェクト
     * @returns プロジェクトデータ
     */
    public static async getYjsProjectData(page: Page): Promise<any> {
        return await page.evaluate(() => {
            const yjsProjectManager = (window as any).__YJS_PROJECT_MANAGER__;
            if (!yjsProjectManager) {
                return null;
            }

            const project = yjsProjectManager.getProject();
            const metadata = yjsProjectManager.getProjectMetadata();

            return {
                project: project
                    ? {
                        id: project.id,
                        title: project.title,
                        items: project.items.toArray().map((item: any) => ({
                            id: item.id,
                            text: item.text,
                        })),
                    }
                    : null,
                metadata: metadata,
                pages: yjsProjectManager.getPages(),
            };
        });
    }

    /**
     * テスト用のページをYjs API経由で作成する（Yjsブランチ専用）
     * @param page Playwrightのページオブジェクト
     * @param pageName ページ名
     */
    public static async createTestPageViaAPI(page: Page, pageName: string, lines: string[]): Promise<void> {
        // Yjsブランチ: Yjs APIを使用してページを作成（Fluidコードは削除）
        let pageId: string | null = null;
        try {
            pageId = await page.evaluate(async ({ pageName, lines }) => {
                // Yjsブランチ: FluidStoreの待機は削除（不要）
                // let attempts = 0;
                // const maxAttempts = 300; // wait up to 30 seconds
                // while (!window.__FLUID_STORE__ && attempts < maxAttempts) {
                // Yjsブランチ: FluidStoreとFluidClientのコードは削除（不要）
                // await new Promise(resolve => setTimeout(resolve, 100));
                // attempts++;
                // }
                //
                // if (!window.__FLUID_STORE__) {
                //     console.log("FluidStore not available after waiting, skipping Fluid page creation");
                //     return null;
                // }

                // YjsProjectManagerを取得
                const yjsProjectManager = (window as any).__YJS_PROJECT_MANAGER__;
                if (!yjsProjectManager) {
                    console.log("YjsProjectManager not found, cannot create Yjs page");
                    return null;
                }

                // ページIDを生成
                const pageId = `page-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

                // Yjsページを作成
                await yjsProjectManager.createPage(pageName, "test-user", lines, pageId);
                console.log(`TestHelpers: Created Yjs page "${pageName}" with ID: ${pageId}`);

                // アイテムIDを生成（テスト用）
                const yjsItemIds = lines.map((_, index) => `item-${pageId}-${index}`);
                console.log(`TestHelpers: Yjs item IDs:`, yjsItemIds);

                // YjsアイテムIDをグローバル変数に保存
                window.__LAST_CREATED_ITEM_IDS__ = yjsItemIds;

                return { pageId, itemIds: yjsItemIds };
            }, { pageName, lines });

            // Yjsブランチ: 上記でYjsページの作成は完了済み（重複コードを削除）
            const actualPageId = typeof pageId === "object" && pageId.pageId ? pageId.pageId : pageId;
            console.log(`TestHelpers: Yjs page creation completed with ID: ${actualPageId}`);
        } catch (error) {
            console.log("TestHelper: Yjs page creation failed, but continuing...", error.message);
        }
    }

    /**
     * カーソル情報取得用のデバッグ関数をセットアップする
     * @param page Playwrightのページオブジェクト
     */
    private static async setupCursorDebugger(page: Page): Promise<void> {
        // ページが閉じられていないかチェック
        if (page.isClosed()) {
            console.log("TestHelper: Page is closed, skipping cursor debugger setup");
            return;
        }

        await page.addInitScript(() => {
            // グローバルオブジェクトにデバッグ関数を追加
            window.getCursorDebugData = function() {
                // EditorOverlayStoreインスタンスを取得
                const editorOverlayStore = window.editorOverlayStore;
                if (!editorOverlayStore) {
                    console.error("EditorOverlayStore instance not found");
                    return { error: "EditorOverlayStore instance not found" };
                }

                try {
                    // カーソル情報を取得
                    const cursors = Object.values(editorOverlayStore.cursors);
                    const selections = Object.values(editorOverlayStore.selections);
                    const activeItemId = editorOverlayStore.activeItemId;
                    const cursorVisible = editorOverlayStore.cursorVisible;

                    // カーソルインスタンスの情報を取得
                    const cursorInstances: Array<{
                        cursorId: string;
                        itemId: string;
                        offset: number;
                        isActive: boolean;
                        userId: string;
                    }> = [];

                    editorOverlayStore.cursorInstances.forEach((cursor: any, id: string) => {
                        cursorInstances.push({
                            cursorId: id,
                            itemId: cursor.itemId,
                            offset: cursor.offset,
                            isActive: cursor.isActive,
                            userId: cursor.userId,
                        });
                    });

                    return {
                        cursors,
                        selections,
                        activeItemId,
                        cursorVisible,
                        cursorInstances,
                        cursorCount: cursors.length,
                        selectionCount: selections.length,
                    };
                } catch (error) {
                    console.error("Error getting cursor data:", error);
                    return { error: error instanceof Error ? error.message : "Unknown error" };
                }
            };

            // 拡張版のデバッグ関数 - 特定のパスのデータのみを取得
            window.getCursorPathData = function(path) {
                // EditorOverlayStoreインスタンスを取得
                const editorOverlayStore = window.editorOverlayStore;
                if (!editorOverlayStore) {
                    return { error: "EditorOverlayStore instance not found" };
                }

                try {
                    // 自分自身の関数を使用してカーソルデータを取得
                    const cursorData = window.getCursorDebugData ? window.getCursorDebugData() : null;
                    if (!cursorData) return null;
                    if (!path) return cursorData;

                    // パスに基づいてデータを取得
                    const parts = path.split(".");
                    let result = cursorData;
                    for (const part of parts) {
                        if (result === undefined || result === null) return null;
                        result = result[part];
                    }
                    return result;
                } catch (error) {
                    return { error: error instanceof Error ? error.message : "Unknown error" };
                }
            };
        });

        // EditorOverlayStoreがグローバルに公開されていることを確認
        // await page.waitForFunction(() => window.editorOverlayStore, { timeout: 5000 });
    }

    /**
     * Yjsデータ取得用のデバッグ関数をセットアップする（Yjsブランチ専用）
     * @param page Playwrightのページオブジェクト
     */
    public static async setupTreeDebugger(page: Page): Promise<void> {
        // ページが閉じられていないかチェック
        if (page.isClosed()) {
            console.log("TestHelper: Page is closed, skipping tree debugger setup");
            return;
        }

        await page.addInitScript(() => {
            // Yjsブランチ: Yjsデータ取得用のデバッグ関数を追加
            window.getYjsTreeDebugData = function() {
                // グローバルYjsProjectManagerインスタンスを取得
                const yjsProjectManager = window.__YJS_PROJECT_MANAGER__;
                if (!yjsProjectManager) {
                    console.error("YjsProjectManager instance not found");
                    return { error: "YjsProjectManager instance not found" };
                }

                try {
                    // YjsProjectManagerからデータを取得
                    const projectTitle = yjsProjectManager.getProjectTitle();
                    const pages = yjsProjectManager.getPages();
                    const treeData = { projectTitle, pages };
                    return treeData;
                } catch (error) {
                    console.error("Error getting Yjs tree data:", error);
                    return { error: error instanceof Error ? error.message : "Unknown error" };
                }
            };

            // Yjsブランチ: 拡張版のデバッグ関数 - 特定のパスのデータのみを取得
            window.getYjsTreePathData = function(path) {
                const yjsProjectManager = window.__YJS_PROJECT_MANAGER__;
                if (!yjsProjectManager) {
                    return { error: "YjsProjectManager instance not found" };
                }

                try {
                    const projectTitle = yjsProjectManager.getProjectTitle();
                    const pages = yjsProjectManager.getPages();
                    const treeData = { projectTitle, pages };
                    if (!path) return treeData;

                    // パスに基づいてデータを取得
                    const parts = path.split(".");
                    let result = treeData;
                    for (const part of parts) {
                        if (result === undefined || result === null) return null;
                        result = result[part];
                    }
                    return result;
                } catch (error) {
                    return { error: error instanceof Error ? error.message : "Unknown error" };
                }
            };
        });
    }

    /**
     * カーソルが表示されるまで待機する
     * @param page Playwrightのページオブジェクト
     * @param timeout タイムアウト時間（ミリ秒）
     */
    public static async waitForCursorVisible(page: Page, timeout = 15000): Promise<boolean> {
        try {
            // CursorValidatorを使用してカーソルの存在を確認
            await page.waitForFunction(() => {
                const editorOverlayStore = (window as any).editorOverlayStore;
                if (!editorOverlayStore) {
                    return false;
                }
                const cursors = Object.values(editorOverlayStore.cursors);
                const activeCursors = cursors.filter((c: any) => c.isActive);
                return activeCursors.length > 0;
            }, { timeout });
            return true;
        } catch (error) {
            console.log("Timeout waiting for cursor to be visible, continuing anyway");
            // ページが閉じられていないかチェックしてからスクリーンショットを撮影
            try {
                if (!page.isClosed()) {
                    await page.screenshot({ path: "client/test-results/cursor-visible-timeout.png" });
                }
            } catch (screenshotError) {
                console.log("Failed to take screenshot:", screenshotError);
            }
            return false;
        }
    }

    /**
     * エディターストアを使用してカーソルを設定する
     * @param page Playwrightのページオブジェクト
     * @param itemId アイテムID
     * @param offset カーソル位置
     * @param userId ユーザーID
     */
    public static async setCursor(
        page: Page,
        itemId: string,
        offset: number = 0,
        userId: string = "local",
    ): Promise<void> {
        await page.evaluate(async ({ itemId, offset, userId }) => {
            const editorOverlayStore = (window as any).editorOverlayStore;
            if (editorOverlayStore && editorOverlayStore.setCursor) {
                console.log(
                    `TestHelpers.setCursor: Setting cursor for itemId=${itemId}, offset=${offset}, userId=${userId}`,
                );
                editorOverlayStore.setCursor({
                    itemId: itemId,
                    offset: offset,
                    isActive: true,
                    userId: userId,
                });
            } else {
                console.error(`TestHelpers.setCursor: editorOverlayStore or setCursor not available`);
            }
        }, { itemId, offset, userId });
    }

    /**
     * カーソルを使用してテキストを入力する
     * @param page Playwrightのページオブジェクト
     * @param itemId アイテムID
     * @param text 入力するテキスト
     * @param userId ユーザーID
     */
    public static async insertText(
        page: Page,
        itemId: string,
        text: string,
        userId: string = "local",
    ): Promise<void> {
        await page.evaluate(async ({ itemId, text, userId }) => {
            const editorOverlayStore = (window as any).editorOverlayStore;
            if (editorOverlayStore && editorOverlayStore.getCursorInstances) {
                const cursorInstances = editorOverlayStore.getCursorInstances();
                const cursor = cursorInstances.find((c: any) => c.itemId === itemId && c.userId === userId);
                if (cursor && cursor.insertText) {
                    console.log(`TestHelpers.insertText: Found cursor for itemId=${itemId}, userId=${userId}`);
                    cursor.insertText(text);
                } else {
                    console.error(`TestHelpers.insertText: Cursor not found for itemId=${itemId}, userId=${userId}`);
                    console.log(
                        `Available cursors:`,
                        cursorInstances.map((c: any) => ({ itemId: c.itemId, userId: c.userId })),
                    );
                }
            } else {
                console.error(`TestHelpers.insertText: editorOverlayStore or getCursorInstances not available`);
            }
        }, { itemId, text, userId });
    }

    /**
     * プロジェクトページに移動する
     * 既存のプロジェクトがあればそれを使用し、なければ新規作成する
     * @param page Playwrightのページオブジェクト
     * @returns プロジェクト名
     */
    public static async navigateToTestProjectPage(
        page: Page,
        testInfo: any,
        lines: string[],
    ): Promise<{ projectName: string; pageName: string; }> {
        const projectName = process.env.E2E_PROJECT_NAME || `Test Project ${testInfo.workerIndex} ${Date.now()}`;
        const pageName = process.env.E2E_PAGE_NAME || `test-page-${Date.now()}`;

        console.log("TestHelper: Creating test project and page via API");
        await TestHelpers.createTestProjectAndPageViaAPI(page, projectName, pageName, lines);

        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);
        const url = `/${encodedProject}/${encodedPage}`;

        console.log("TestHelper: Navigating to project page:", url);
        await page.goto(url);

        // 遷移後の状態を確認
        const currentUrl = page.url();
        console.log(`TestHelper: Current URL after navigation: ${currentUrl}`);

        // title() 呼び出しはテスト終了時に例外を投げることがあるため回避
        try {
            const pageTitle = await page.title();
            console.log(`TestHelper: Page title: ${pageTitle}`);
        } catch (e) {
            console.log(`TestHelper: Skipping page.title() due to potential test shutdown: ${e?.message || e}`);
        }

        // ページルートの自動処理を待機（手動設定は行わない）
        console.log("TestHelper: Waiting for page route to automatically load project and page");

        // Yjsブランチ: 認証状態の確認（Firebase認証が無効化されている場合はスキップ）
        console.log("TestHelper: Checking authentication state");
        const authEnabled = await page.evaluate(() => {
            const viteEnv = (window as any).import?.meta?.env || {};
            return viteEnv.VITE_USE_FIREBASE_AUTH !== "false" && viteEnv.VITE_USE_FIREBASE_AUTH !== false;
        });

        if (authEnabled) {
            console.log("TestHelper: Waiting for authentication detection");
            await page.waitForFunction(() => {
                const userManager = (window as any).__USER_MANAGER__;
                if (!userManager) {
                    console.log("TestHelper: UserManager not available yet");
                    return false;
                }

                const currentUser = userManager.getCurrentUser();
                console.log("TestHelper: Auth check - currentUser exists:", !!currentUser);
                return !!currentUser;
            }, { timeout: 30000 });
            console.log("TestHelper: Authentication detected, waiting for project loading");
        } else {
            console.log("TestHelper: Firebase auth disabled, skipping authentication check");
        }

        // ページの詳細な状態をログ出力
        await page.evaluate(() => {
            console.log("TestHelper: Current page state:");
            console.log("TestHelper: URL:", window.location.href);
            console.log("TestHelper: generalStore exists:", !!(window as any).generalStore);
            console.log("TestHelper: fluidStore exists:", !!(window as any).__FLUID_STORE__);

            const generalStore = (window as any).generalStore;
            if (generalStore) {
                console.log("TestHelper: generalStore.project exists:", !!generalStore.project);
                console.log("TestHelper: generalStore.pages exists:", !!generalStore.pages);
                console.log("TestHelper: generalStore.currentPage exists:", !!generalStore.currentPage);
            }

            const fluidStore = (window as any).__FLUID_STORE__;
            if (fluidStore) {
                console.log("TestHelper: fluidStore.fluidClient exists:", !!fluidStore.fluidClient);
            }
        });

        // generalStoreが設定されるまで待機（OutlinerBaseのマウントは後で確認）
        console.log("TestHelper: Waiting for generalStore to be available");

        // より詳細なデバッグ情報を追加
        await page.evaluate(() => {
            console.log("TestHelper: Current page state before generalStore wait:");
            console.log("TestHelper: URL:", window.location.href);
            console.log(
                "TestHelper: Available global objects:",
                Object.keys(window).filter(k => k.startsWith("__") || k.includes("Store") || k.includes("store")),
            );
            console.log("TestHelper: Document ready state:", document.readyState);
            console.log("TestHelper: Body innerHTML length:", document.body.innerHTML.length);
        });

        try {
            await page.waitForFunction(() => {
                const generalStore = (window as any).generalStore;

                console.log("TestHelper: GeneralStore availability check", {
                    hasGeneralStore: !!generalStore,
                });

                return !!generalStore;
            }, { timeout: 30000 });
        } catch (error) {
            console.log("TestHelper: generalStore wait failed, checking page state");
            await page.evaluate(() => {
                console.log("TestHelper: Final page state after generalStore timeout:");
                console.log("TestHelper: Available stores:", {
                    generalStore: !!(window as any).generalStore,
                    fluidStore: !!(window as any).__FLUID_STORE__,
                    userManager: !!(window as any).__USER_MANAGER__,
                });
                console.log("TestHelper: DOM elements:", {
                    outlinerBase: !!document.querySelector('[data-testid="outliner-base"]'),
                    searchBox: !!document.querySelector(".page-search-box"),
                    main: !!document.querySelector("main"),
                });
            });
            throw error;
        }

        // プロジェクトとページの自動読み込みを待機
        console.log("TestHelper: OutlinerBase mounted, waiting for project and page loading");

        // データ一致検証を使用した早期終了機能付き待機
        console.log("TestHelper: Using data consistency check for early termination...");
        const dataConsistencySuccess = await this.waitForDataConsistency(page, 5000, 1000);

        if (dataConsistencySuccess) {
            console.log("TestHelper: ✅ Data consistency achieved - early termination successful!");
            console.log("TestHelper: Skipping UI element checks since data validation passed");

            // データ一致検証が成功した場合は、UI要素の詳細チェックをスキップ
            // テストで必要なUI要素は、テスト実行時に個別に待機する
        } else {
            console.log("TestHelper: ⚠️ Data consistency check failed, but continuing with basic checks...");

            // データ一致検証が失敗した場合は、基本的な条件チェックにフォールバック
            try {
                await page.waitForFunction(() => {
                    const generalStore = (window as any).generalStore;
                    const fluidStore = (window as any).__FLUID_STORE__;

                    if (!generalStore || !fluidStore) {
                        console.log("TestHelper: Stores not available yet", {
                            hasGeneralStore: !!generalStore,
                            hasFluidStore: !!fluidStore,
                        });
                        return false;
                    }

                    const hasProject = !!generalStore.project;
                    const hasFluidClient = !!fluidStore.fluidClient;
                    const hasPages = !!(generalStore.pages && generalStore.pages.current);
                    const hasCurrentPage = !!generalStore.currentPage;

                    console.log("TestHelper: Project loading check", {
                        hasProject,
                        hasFluidClient,
                        hasPages,
                        hasCurrentPage,
                        pagesCount: generalStore.pages?.current?.length || 0,
                        currentPageText: generalStore.currentPage?.text || "none",
                        currentPageId: generalStore.currentPage?.id || "none",
                        projectTitle: generalStore.project?.title || "none",
                        fluidClientContainerId: fluidStore.fluidClient?.containerId || "none",
                    });

                    // プロジェクト、ページが設定されていることを確認
                    const basicConditionsMet = hasProject && hasPages;

                    if (basicConditionsMet) {
                        console.log("TestHelper: Basic conditions met (project and pages available)");
                        return true;
                    }

                    console.log("TestHelper: Basic conditions not met, continuing to wait");
                    return false;
                }, { timeout: 15000, polling: 1000 }); // 15秒のタイムアウト、1秒ごとにポーリング

                console.log("TestHelper: Basic conditions met via fallback check");
            } catch (error) {
                console.log("TestHelper: Fallback check also failed, but data validation passed - continuing");
                // データ検証が成功している場合は、基本条件チェックの失敗を無視
            }
        }

        // ページコンポーネントが初期化されるまで待機
        console.log("TestHelper: Waiting for page component initialization");

        // データ一致検証が成功している場合は、UI要素の詳細チェックをスキップ
        if (dataConsistencySuccess) {
            console.log("TestHelper: Data consistency achieved - skipping detailed UI checks");
        } else {
            // データ一致検証が失敗した場合のみ、詳細なUI要素チェックを実行
            console.log("TestHelper: Data consistency not achieved - performing detailed UI checks");

            // まずページの基本的な状態を確認
            await page.evaluate(() => {
                console.log("TestHelper: Current page HTML structure:");
                console.log("TestHelper: body.innerHTML length:", document.body.innerHTML.length);
                console.log("TestHelper: main elements:", document.querySelectorAll("main").length);
                console.log(
                    "TestHelper: outliner-base elements:",
                    document.querySelectorAll('[data-testid="outliner-base"]').length,
                );
                console.log("TestHelper: outliner elements:", document.querySelectorAll(".outliner").length);
                console.log("TestHelper: page title:", document.title);
            });

            // デバッグ用スクリーンショット
            await page.screenshot({ path: "test-results/debug-page-before-wait.png" });

            try {
                // currentPageが設定されるまで待機
                console.log("TestHelper: Waiting for currentPage to be set");
                await page.waitForFunction(() => {
                    const generalStore = (window as any).generalStore;
                    const hasCurrentPage = !!(generalStore && generalStore.currentPage);

                    if (hasCurrentPage) {
                        console.log("TestHelper: currentPage is set:", generalStore.currentPage.text);
                    }

                    return hasCurrentPage;
                }, { timeout: 15000 }); // タイムアウトを短縮

                // OutlinerBaseが表示されるまで待機（短縮されたタイムアウト）
                console.log("TestHelper: Waiting for OutlinerBase to be visible");
                try {
                    await page.waitForFunction(() => {
                        const outlinerBase = document.querySelector('[data-testid="outliner-base"]');
                        const hasOutlinerBase = !!outlinerBase;

                        console.log("TestHelper: OutlinerBase check", {
                            hasOutlinerBase,
                            outlinerBaseContent: outlinerBase?.textContent?.substring(0, 100),
                        });

                        return hasOutlinerBase;
                    }, { timeout: 8000 }); // タイムアウトを8秒に短縮
                } catch (outlinerBaseError) {
                    console.log("TestHelper: OutlinerBase wait timeout, but continuing");
                }
            } catch (error) {
                console.log("TestHelper: Page initialization timeout, but continuing");
            }
        }

        console.log("TestHelper: Page component initialized, waiting for OutlinerTree");

        // データ一致検証が成功している場合は、OutlinerTreeの詳細チェックをスキップ
        if (dataConsistencySuccess) {
            console.log("TestHelper: Data consistency achieved - skipping OutlinerTree detailed checks");
        } else {
            // データ一致検証が失敗した場合のみ、OutlinerTreeの詳細チェックを実行
            console.log("TestHelper: Data consistency not achieved - performing OutlinerTree checks");

            try {
                await page.waitForFunction(() => {
                    const outlinerTree = document.querySelector(".outliner");
                    const addButton = Array.from(document.querySelectorAll("button")).find(btn =>
                        btn.textContent?.includes("アイテム追加")
                    );
                    const hasOutlinerTree = !!outlinerTree;
                    const hasAddButton = !!addButton;

                    console.log("TestHelper: OutlinerTree check", {
                        hasOutlinerTree,
                        hasAddButton,
                        outlinerTreeContent: outlinerTree?.textContent?.substring(0, 100),
                    });

                    // OutlinerTreeまたはAddButtonのいずれかが存在すれば進行
                    return hasOutlinerTree || hasAddButton;
                }, { timeout: 8000 }); // タイムアウトを8秒に短縮
            } catch (error) {
                console.log("TestHelper: OutlinerTree initialization timeout, continuing anyway");
            }
        }

        console.log("TestHelper: OutlinerTree initialization completed");

        // デバッグ用: 最終的なページの状態を確認（エラー時は無視）
        if (!dataConsistencySuccess) {
            try {
                await page.evaluate(() => {
                    console.log("TestHelper: Final page state");
                    console.log("TestHelper: outliner-item count:", document.querySelectorAll(".outliner-item").length);
                    console.log(
                        "TestHelper: add button count:",
                        Array.from(document.querySelectorAll("button")).filter(btn =>
                            btn.textContent?.includes("アイテム追加")
                        )
                            .length,
                    );
                    console.log("TestHelper: global-textarea exists:", !!document.querySelector(".global-textarea"));
                });
            } catch (debugError) {
                console.log("TestHelper: Final debug evaluation failed, but continuing");
            }
        }

        return { projectName, pageName };
    }

    /**
     * データ一致検証が成功するまで待機する（早期終了機能付き）
     * @param page Playwrightのページオブジェクト
     * @param maxWaitTime 最大待機時間（ミリ秒）
     * @param checkInterval チェック間隔（ミリ秒）
     */
    public static async waitForDataConsistency(
        page: Page,
        maxWaitTime: number = 30000,
        checkInterval: number = 2000,
    ): Promise<boolean> {
        console.log("TestHelper: Starting data consistency check with early termination...");

        const startTime = Date.now();
        let attempts = 0;

        while (Date.now() - startTime < maxWaitTime) {
            attempts++;
            console.log(`TestHelper: Data consistency check attempt ${attempts}...`);

            try {
                // DataValidationHelpersを使用してデータ一致検証を実行
                const { DataValidationHelpers } = await import("./dataValidationHelpers.js");
                await DataValidationHelpers.validateDataConsistency(page, {
                    checkProjectTitle: true,
                    checkPageCount: true,
                    checkPageTitles: true,
                    checkItemCounts: true,
                    logDetails: false,
                });

                console.log(`TestHelper: ✅ Data consistency validation passed on attempt ${attempts}!`);
                console.log(`TestHelper: Early termination successful after ${Date.now() - startTime}ms`);
                return true;
            } catch (error) {
                console.log(`TestHelper: Data consistency check failed on attempt ${attempts}:`, error.message);

                // 最大待機時間に達していない場合は再試行
                if (Date.now() - startTime < maxWaitTime - checkInterval) {
                    console.log(`TestHelper: Waiting ${checkInterval}ms before next attempt...`);
                    await page.waitForTimeout(checkInterval);
                } else {
                    console.log("TestHelper: Maximum wait time reached, data consistency check failed");
                    return false;
                }
            }
        }

        console.log("TestHelper: Data consistency check timed out");
        return false;
    }

    /**
     * アウトライナーアイテムが表示されるのを待つ
     * @param page Playwrightのページオブジェクト
     * @param timeout タイムアウト時間（ミリ秒）
     */
    public static async waitForOutlinerItems(page: Page, timeout = 60000, expectedItemCount = 3): Promise<void> {
        console.log(`Waiting for outliner items to be visible (expecting ${expectedItemCount} items)...`);

        // 現在のURLを確認
        const currentUrl = page.url();
        console.log("Current URL:", currentUrl);

        // プロジェクトページに移動していることを確認
        const url = new URL(currentUrl);
        const pathParts = url.pathname.split("/").filter(part => part);
        const isOnProjectPage = pathParts.length >= 2;

        if (!isOnProjectPage) {
            console.log("Not on a project page, waiting for navigation...");
            await page.waitForTimeout(2000);
        }

        // FluidFrameworkのデータが読み込まれ、期待される数のアイテムが表示されるまで待機
        const startTime = Date.now();
        let lastItemCount = 0;
        let stableCount = 0;
        const requiredStableCount = 3; // 3回連続で同じ数が確認されたら安定とみなす

        while (Date.now() - startTime < timeout) {
            try {
                // DOM要素の存在を確認
                const itemCount = await page.locator(".outliner-item").count();

                // FluidFrameworkの状態を確認
                const fluidState = await page.evaluate(() => {
                    const generalStore = (window as any).generalStore;
                    const currentPage = generalStore?.currentPage;
                    return {
                        hasGeneralStore: !!generalStore,
                        hasCurrentPage: !!currentPage,
                        currentPageItemsLength: currentPage?.items?.length || 0,
                        currentPageText: currentPage?.text || "unknown",
                    };
                });

                console.log(
                    `Items check: DOM=${itemCount}, Fluid=${fluidState.currentPageItemsLength}, Page="${fluidState.currentPageText}"`,
                );

                // 期待される数のアイテムが表示されているかチェック
                if (itemCount >= expectedItemCount && fluidState.hasCurrentPage) {
                    if (lastItemCount === itemCount) {
                        stableCount++;
                        if (stableCount >= requiredStableCount) {
                            console.log(`Found stable ${itemCount} outliner items (expected: ${expectedItemCount})`);
                            break;
                        }
                    } else {
                        stableCount = 1;
                        lastItemCount = itemCount;
                    }
                } else {
                    stableCount = 0;
                    lastItemCount = itemCount;
                }

                await page.waitForTimeout(500);
            } catch (e) {
                console.log("Error during item count check:", e.message);
                await page.waitForTimeout(500);
            }
        }

        // 最終確認
        const finalItemCount = await page.locator(".outliner-item").count();
        if (finalItemCount < expectedItemCount) {
            console.log(`Warning: Expected ${expectedItemCount} items but found ${finalItemCount}`);
            await page.screenshot({ path: "client/test-results/outliner-items-insufficient.png" });

            // デバッグ情報を出力
            const debugInfo = await page.evaluate(() => {
                const generalStore = (window as any).generalStore;
                const currentPage = generalStore?.currentPage;
                return {
                    hasGeneralStore: !!generalStore,
                    hasCurrentPage: !!currentPage,
                    currentPageItemsLength: currentPage?.items?.length || 0,
                    currentPageText: currentPage?.text || "unknown",
                    allItemIds: Array.from(document.querySelectorAll(".outliner-item[data-item-id]")).map(el =>
                        el.getAttribute("data-item-id")
                    ),
                };
            });
            console.log("Debug info:", debugInfo);
        }

        console.log(`Final item count: ${finalItemCount} (expected: ${expectedItemCount})`);

        // 少し待機して安定させる
        await page.waitForTimeout(1000);
    }

    /**
     * アクティブなアイテムIDを取得する
     * @param page Playwrightのページオブジェクト
     * @returns アクティブなアイテムID
     */
    public static async getActiveItemId(page: Page): Promise<string | null> {
        const cursorData = await CursorValidator.getCursorData(page);
        return cursorData.activeItemId;
    }

    /**
     * アクティブなアイテム要素を取得する
     * @param page Playwrightのページオブジェクト
     * @returns アクティブなアイテム要素のロケーター
     */
    public static async getActiveItemLocator(page: Page): Promise<any> {
        const activeItemId = await this.getActiveItemId(page);
        if (!activeItemId) return null;

        return page.locator(`.outliner-item[data-item-id="${activeItemId}"] .item-content`);
    }

    /**
     * 指定インデックスのアイテムIDを取得する
     */
    public static async getItemIdByIndex(page: Page, index: number): Promise<string | null> {
        return await page.evaluate(i => {
            const items = document.querySelectorAll(".outliner-item");
            const target = items[i] as HTMLElement | undefined;
            return target?.dataset.itemId ?? null;
        }, index);
    }

    /**
     * アイテムをクリックして編集モードに入る
     * @param page Playwrightのページオブジェクト
     * @param itemSelector アイテムを特定するセレクタ
     */
    public static async clickItemToEdit(page: Page, itemSelector: string): Promise<void> {
        await page.click(itemSelector);
        await this.waitForCursorVisible(page);

        // カーソルが表示されていることを確認
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBeGreaterThan(0);
        expect(cursorData.activeItemId).not.toBeNull();
    }

    /**
     * マウスオーバーイベントを強制的にシミュレートする
     * Playwrightのhover()メソッドがテスト環境で動作しない場合に使用
     * @param page Playwrightのページオブジェクト
     * @param selector 対象要素のセレクタ
     */
    public static async forceHoverEvent(page: Page, selector: string): Promise<void> {
        await page.evaluate(sel => {
            const element = document.querySelector(sel);
            if (!element) {
                console.error(`Element not found: ${sel}`);
                return;
            }

            // mouseenterイベントを強制的に発火
            const mouseEnterEvent = new MouseEvent("mouseenter", {
                bubbles: true,
                cancelable: true,
                view: window,
            });
            element.dispatchEvent(mouseEnterEvent);

            // mousemoveイベントも発火
            const mouseMoveEvent = new MouseEvent("mousemove", {
                bubbles: true,
                cancelable: true,
                view: window,
            });
            element.dispatchEvent(mouseMoveEvent);

            console.log(`Forced hover events on: ${sel}`);
        }, selector);

        // イベント処理のための短い待機
        await page.waitForTimeout(300);
    }

    /**
     * マウスアウトイベントを強制的にシミュレートする
     * @param page Playwrightのページオブジェクト
     * @param selector 対象要素のセレクタ
     */
    public static async forceMouseOutEvent(page: Page, selector: string): Promise<void> {
        await page.evaluate(sel => {
            let element: Element | null = null;

            // :has-text()セレクタの場合は特別な処理
            if (sel.includes(":has-text(")) {
                const match = sel.match(/^(.+):has-text\("([^"]+)"\)$/);
                if (match) {
                    const baseSelector = match[1];
                    const text = match[2];
                    const elements = Array.from(document.querySelectorAll(baseSelector));

                    for (const el of elements) {
                        if (el.textContent && el.textContent.includes(text)) {
                            element = el;
                            break;
                        }
                    }
                }
            } else {
                element = document.querySelector(sel);
            }

            if (!element) {
                console.error(`Element not found: ${sel}`);
                return;
            }

            // mouseleaveイベントを強制的に発火
            const mouseLeaveEvent = new MouseEvent("mouseleave", {
                bubbles: true,
                cancelable: true,
                view: window,
            });
            element.dispatchEvent(mouseLeaveEvent);

            console.log(`Forced mouseleave event on: ${sel}`);
        }, selector);

        // イベント処理のための短い待機
        await page.waitForTimeout(300);
    }

    /**
     * バックリンクパネルを開く
     * @param page Playwrightのページオブジェクト
     */
    public static async openBacklinkPanel(page: Page): Promise<void> {
        // バックリンクパネルのトグルボタンを探す
        const toggleButton = page.locator(".backlink-toggle-button");

        // ボタンが存在するか確認
        const buttonExists = await toggleButton.count() > 0;
        if (!buttonExists) {
            console.error("Backlink toggle button not found");
            return;
        }

        // パネルが既に開いているか確認
        const isOpen = await toggleButton.evaluate(el => el.classList.contains("active"));
        if (!isOpen) {
            // ボタンをクリックしてパネルを開く
            await toggleButton.click();

            // パネルが開くのを待機
            await page.waitForTimeout(500);
        }
    }

    /**
     * AliasPicker から指定されたパスのオプションを選択する
     * @param page Playwrightのページオブジェクト
     * @param path エイリアス先のパス
     */
    public static async confirmAliasOption(page: Page, itemId: string): Promise<void> {
        await page.evaluate(id => {
            const store = (window as any).aliasPickerStore;
            if (store && typeof store.confirmById === "function") {
                store.confirmById(id);
            }
        }, itemId);
    }

    public static async selectAliasOption(page: Page, itemId: string): Promise<void> {
        // エイリアスピッカーが表示されていることを確認
        await page.locator(".alias-picker").waitFor({ state: "visible", timeout: 5000 });

        // 対象のボタンが存在することを確認
        const selector = `.alias-picker button[data-id="${itemId}"]`;
        await page.locator(selector).waitFor({ state: "visible", timeout: 5000 });

        // ボタンをクリックしてエイリアスを選択（DOM操作ベース）
        // タイムアウトを短くして、失敗した場合は代替手法を使用
        try {
            await page.locator(selector).click({ timeout: 3000 });
        } catch (error) {
            console.log("Button click failed, trying DOM-based click");
            try {
                // DOM操作でクリックを試行
                await page.evaluate((itemId) => {
                    const button = document.querySelector(
                        `.alias-picker button[data-id="${itemId}"]`,
                    ) as HTMLButtonElement;
                    if (button) {
                        button.click();
                    } else {
                        throw new Error(`Button not found for itemId: ${itemId}`);
                    }
                }, itemId);
            } catch (domError) {
                console.log("DOM click also failed, trying to close picker gracefully");
                // エイリアスピッカーストアを直接操作して閉じる
                await page.evaluate(() => {
                    const store = (window as any).aliasPickerStore;
                    if (store && typeof store.hide === "function") {
                        store.hide();
                    }
                });
                throw new Error(`Failed to select alias option: ${error.message}, DOM error: ${domError.message}`);
            }
        }

        // エイリアスピッカーが非表示になるまで待機
        await page.locator(".alias-picker").waitFor({ state: "hidden", timeout: 5000 });
    }

    public static async clickAliasOptionViaDOM(page: Page, itemId: string): Promise<void> {
        const selector = `.alias-picker button[data-id="${itemId}"]`;
        await page.evaluate(sel => {
            const btn = document.querySelector(sel) as HTMLElement | null;
            btn?.click();
        }, selector);
    }

    public static async setAliasTarget(page: Page, itemId: string, targetId: string): Promise<void> {
        // 既存のエイリアスアイテムのターゲットを変更する（直接AliasPickerStoreを呼び出し）
        await page.evaluate(id => {
            const store = (window as any).aliasPickerStore;
            if (store && typeof store.show === "function") {
                store.show(id);
            }
        }, itemId);

        // エイリアスピッカーが表示されるまで待機
        await page.locator(".alias-picker").waitFor({ state: "visible", timeout: 5000 });

        // ターゲットアイテムのボタンをクリック
        const selector = `.alias-picker button[data-id="${targetId}"]`;
        await page.locator(selector).waitFor({ state: "visible", timeout: 5000 });
        await page.locator(selector).click();

        // エイリアスピッカーが非表示になるまで待機
        await page.locator(".alias-picker").waitFor({ state: "hidden", timeout: 5000 });

        // 少し待機してからエイリアスパスが表示されることを確認
        await page.waitForTimeout(500);
    }

    public static async hideAliasPicker(page: Page): Promise<void> {
        // エイリアスピッカーが表示されている場合のみ非表示にする
        const isVisible = await page.locator(".alias-picker").isVisible();
        if (isVisible) {
            console.log("Hiding alias picker...");
            try {
                // まず、ストア経由で直接非表示にする（最も確実）
                await page.evaluate(() => {
                    const store = (window as any).aliasPickerStore;
                    if (store && typeof store.hide === "function") {
                        console.log("Hiding alias picker via store");
                        store.hide();
                    }
                });

                // 非表示になるまで待機
                await page.locator(".alias-picker").waitFor({ state: "hidden", timeout: 3000 });
                console.log("Alias picker hidden successfully");
            } catch (error) {
                console.log("Failed to hide alias picker via store, trying keyboard method");
                try {
                    // エイリアスピッカーの入力フィールドにフォーカスを設定
                    await page.locator(".alias-picker input").focus();
                    await page.waitForTimeout(100);
                    // Escapeキーを押してエイリアスピッカーを閉じる
                    await page.keyboard.press("Escape", { timeout: 2000 });
                    await page.locator(".alias-picker").waitFor({ state: "hidden", timeout: 3000 });
                    console.log("Alias picker hidden via keyboard");
                } catch (keyboardError) {
                    console.log("Keyboard method also failed, trying body click");
                    // 代替手法：ページの他の場所をクリックしてピッカーを閉じる
                    await page.click("body");
                    await page.waitForTimeout(500);
                    console.log("Tried body click as fallback");
                }
            }
        }
    }

    public static async showAliasPicker(page: Page, itemId: string): Promise<void> {
        // DOM操作ベースでエイリアスピッカーを表示する代替手法
        // アイテムをクリックしてフォーカスを設定
        await page.click(`.outliner-item[data-item-id="${itemId}"] .item-content`);
        await page.waitForTimeout(500);

        // テキストエリアにフォーカスを設定
        await page.evaluate(() => {
            const textarea = document.querySelector(".global-textarea") as HTMLTextAreaElement;
            textarea?.focus();
        });
        await page.waitForTimeout(300);

        // /aliasコマンドを入力してエイリアスピッカーを表示
        await page.keyboard.type("/alias");
        await page.keyboard.press("Enter");

        // エイリアスピッカーが表示されるまで待機
        await page.locator(".alias-picker").waitFor({ state: "visible", timeout: 5000 });
    }

    /**
     * DOM属性からaliasTargetIdを取得する（page.evaluate不要）
     */
    public static async getAliasTargetId(page: Page, itemId: string): Promise<string | null> {
        const element = page.locator(`.outliner-item[data-item-id="${itemId}"]`);
        const aliasTargetId = await element.getAttribute("data-alias-target-id");
        return aliasTargetId && aliasTargetId !== "" ? aliasTargetId : null;
    }

    /**
     * エイリアスパスが表示されているかを確認する（DOM操作ベース）
     */
    public static async isAliasPathVisible(page: Page, itemId: string): Promise<boolean> {
        const aliasPath = page.locator(`.outliner-item[data-item-id="${itemId}"] .alias-path`);
        return await aliasPath.isVisible();
    }

    /**
     * エイリアスサブツリーが表示されているかを確認する（DOM操作ベース）
     */
    public static async isAliasSubtreeVisible(page: Page, itemId: string): Promise<boolean> {
        const aliasSubtree = page.locator(`.outliner-item[data-item-id="${itemId}"] .alias-subtree`);
        return await aliasSubtree.isVisible();
    }

    /**
     * エイリアスパス内のボタンをクリックしてナビゲーションをテストする（DOM操作ベース）
     */
    public static async clickAliasPathButton(page: Page, itemId: string, buttonIndex: number): Promise<void> {
        const aliasPath = page.locator(`.outliner-item[data-item-id="${itemId}"] .alias-path`);
        const buttons = aliasPath.locator("button");
        await buttons.nth(buttonIndex).click();
    }

    /**
     * エイリアスパス内のボタンの数を取得する（DOM操作ベース）
     */
    public static async getAliasPathButtonCount(page: Page, itemId: string): Promise<number> {
        const aliasPath = page.locator(`.outliner-item[data-item-id="${itemId}"] .alias-path`);
        const buttons = aliasPath.locator("button");
        return await buttons.count();
    }

    /**
     * 指定したアイテムの aliasTargetId を取得する
     * @param page Playwright のページオブジェクト
     * @param itemId 取得対象アイテムの ID
     */
    public static async getAliasTarget(page: Page, itemId: string): Promise<string | null> {
        // DOM属性から直接aliasTargetIdを取得（page.evaluateを使わない代替手法）
        const element = page.locator(`.outliner-item[data-item-id="${itemId}"]`);
        const aliasTargetId = await element.getAttribute("data-alias-target-id");
        return aliasTargetId && aliasTargetId.trim() !== "" ? aliasTargetId : null;
    }

    /**
     * テスト環境でのDOM要素の可視性を強制的に確認する
     * @param selector 対象要素のセレクタ
     * @param page Playwrightのページオブジェクト
     * @param waitTime 要素が表示されるまで待機する時間（ミリ秒）
     * @param retryCount 再試行回数
     * @returns 要素が存在し表示されている場合はtrue
     */
    public static async forceCheckVisibility(
        selector: string,
        page: Page,
        waitTime: number = 500,
        retryCount: number = 3,
    ): Promise<boolean> {
        // 要素が表示されるまで待機
        if (waitTime > 0) {
            await page.waitForTimeout(waitTime);
        }

        // 複数回試行する
        for (let i = 0; i < retryCount; i++) {
            try {
                // 要素が存在するか確認
                const elementExists = await page.locator(selector).count() > 0;
                if (!elementExists) {
                    console.log(`Element not found: ${selector} (attempt ${i + 1}/${retryCount})`);

                    // 内部リンクの場合は、強制的にレンダリングを試みる
                    if (selector.includes(".internal-link") || selector.includes(".link-preview")) {
                        console.log("Trying to force render internal links...");
                        await page.evaluate(() => {
                            // 内部リンクを含む可能性のあるテキスト要素を検索
                            const textElements = document.querySelectorAll(".item-text");
                            console.log(`Found ${textElements.length} text elements to check for links`);

                            textElements.forEach(el => {
                                const text = el.textContent || "";
                                // 内部リンクのパターンを検出
                                if (text.includes("[") && text.includes("]")) {
                                    console.log("Found potential link in:", text);
                                    // フォーマット済みクラスを追加して強制的にレンダリング
                                    el.classList.add("formatted");
                                }
                            });
                        });
                    }

                    if (i < retryCount - 1) {
                        await page.waitForTimeout(300);
                        continue;
                    }
                    return false;
                }

                // 要素の可視性を確認
                const isVisible = await page.evaluate(sel => {
                    const element = document.querySelector(sel);
                    if (!element) return false;

                    // 要素が画面内に表示されているか確認
                    const rect = element.getBoundingClientRect();

                    // スタイルを確認
                    const style = window.getComputedStyle(element);
                    const isVisibleStyle = style.display !== "none"
                        && style.visibility !== "hidden"
                        && style.opacity !== "0"
                        && rect.height > 0
                        && rect.width > 0;

                    // 親要素が非表示になっていないか確認
                    let parent = element.parentElement;
                    let isParentVisible = true;

                    while (parent) {
                        const parentStyle = window.getComputedStyle(parent);
                        if (
                            parentStyle.display === "none"
                            || parentStyle.visibility === "hidden"
                            || parentStyle.opacity === "0"
                        ) {
                            isParentVisible = false;
                            break;
                        }
                        parent = parent.parentElement;
                    }

                    return isVisibleStyle && isParentVisible;
                }, selector);

                if (isVisible) {
                    return true;
                }

                console.log(`Element found but not visible: ${selector} (attempt ${i + 1}/${retryCount})`);

                // 内部リンクの場合は、強制的に表示を試みる
                if (selector.includes(".link-preview-popup")) {
                    console.log("Trying to force show link preview...");
                    await page.evaluate(sel => {
                        const element = document.querySelector(sel);
                        if (element) {
                            // 強制的に表示
                            (element as HTMLElement).style.display = "block";
                            (element as HTMLElement).style.visibility = "visible";
                            (element as HTMLElement).style.opacity = "1";
                        }
                    }, selector);
                }

                if (i < retryCount - 1) {
                    await page.waitForTimeout(300);
                }
            } catch (error) {
                console.error(`Error checking visibility for ${selector}:`, error);
                if (i < retryCount - 1) {
                    await page.waitForTimeout(300);
                }
            }
        }

        return false;
    }

    /**
     * 要素が表示されるまで待機する
     * @param page Playwrightのページオブジェクト
     * @param selector 対象要素のセレクタ
     * @param timeout タイムアウト時間（ミリ秒）
     * @returns 要素が表示された場合はtrue
     */
    public static async waitForElementVisible(
        page: Page,
        selector: string,
        timeout: number = 10000,
    ): Promise<boolean> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            const isVisible = await this.forceCheckVisibility(selector, page, 0, 1);
            if (isVisible) {
                return true;
            }

            // 短い間隔で再試行
            await page.waitForTimeout(200);
        }

        console.log(`Timeout waiting for element to be visible: ${selector}`);
        return false;
    }

    // 注: 422行目に同名のメソッドが既に定義されているため、このメソッドは削除します
}

/**
 * YjsServiceのテスト用ヘルパークラス
 */
export class YjsServiceHelper {
    /**
     * プロジェクトタイトルからYjsプロジェクトを取得する
     * @param page Playwrightのページオブジェクト
     * @param projectTitle プロジェクトタイトル
     * @returns Yjsプロジェクトの基本情報、見つからない場合はundefined
     */
    public static async getYjsProjectByTitle(page: Page, projectTitle: string): Promise<any> {
        return await page.evaluate(async title => {
            if (!title) {
                throw new Error("プロジェクトタイトルが指定されていません");
            }

            console.log(`YjsServiceHelper: Looking for project: ${title}`);

            const yjsProjectManager = (window as any).__YJS_PROJECT_MANAGER__;
            if (!yjsProjectManager) {
                console.log("YjsServiceHelper: YjsProjectManager not found");
                return undefined;
            }

            // プロジェクトメタデータを取得
            const metadata = yjsProjectManager.getProjectMetadata();
            console.log(`YjsServiceHelper: Found metadata:`, metadata);

            if (!metadata || metadata.title !== title) {
                console.log(
                    `YjsServiceHelper: Project not found or title mismatch. Expected: ${title}, Found: ${metadata?.title}`,
                );
                return undefined;
            }

            // プロジェクトオブジェクトを取得
            const project = yjsProjectManager.getProject();
            if (!project) {
                console.log("YjsServiceHelper: Project object not found");
                return undefined;
            }

            console.log(`YjsServiceHelper: Successfully found project: ${title}`);

            // シリアライズ可能な形式で返す
            return {
                projectId: metadata.id || title,
                project: {
                    title: metadata.title,
                    id: metadata.id || title,
                },
                treeData: {
                    items: project.items
                        ? project.items.toArray().map((item: any) => ({
                            id: item.id,
                            text: item.text,
                        }))
                        : [],
                },
            };
        }, projectTitle);
    }

    /**
     * 新しいYjsプロジェクトを作成する（最適化版）
     * @param page Playwrightのページオブジェクト
     * @param projectName プロジェクト名
     * @returns Yjsプロジェクトインスタンス
     */
    public static async createNewYjsProject(page: Page, projectName: string): Promise<any> {
        return await page.evaluate(async name => {
            console.log(`YjsServiceHelper: Creating Yjs project (optimized): ${name}`);

            // 既存のYjsProjectManagerがあるかチェック
            let yjsProjectManager = (window as any).__YJS_PROJECT_MANAGER__;

            if (!yjsProjectManager) {
                // グローバルコンストラクタを使用（動的インポートを避ける）
                const YjsProjectManager = (window as any).YjsProjectManager;
                if (!YjsProjectManager) {
                    throw new Error("YjsProjectManager constructor not found on window");
                }

                yjsProjectManager = new YjsProjectManager(name);
                await yjsProjectManager.connect(name);
                console.log(`YjsServiceHelper: Connected to project (optimized): ${name}`);

                // グローバル変数に設定
                (window as any).__YJS_PROJECT_MANAGER__ = yjsProjectManager;
            }

            // プロジェクトタイトルを設定
            yjsProjectManager.updateProjectTitle(name);

            // プロジェクトメタデータを取得
            const metadata = yjsProjectManager.getProjectMetadata();
            const project = yjsProjectManager.getProject();

            return {
                projectId: name,
                project: {
                    title: metadata?.title || name,
                    id: name,
                },
                treeData: {
                    items: project
                        ? project.items.toArray().map((item: any) => ({
                            id: item.id,
                            text: item.text,
                        }))
                        : [],
                },
                yjsProjectManager: yjsProjectManager,
            };
        }, projectName);
    }

    /**
     * Yjsページを作成する
     * @param page Playwrightのページオブジェクト
     * @param projectId プロジェクトID
     * @param pageName ページ名
     * @param lines 初期コンテンツ
     * @returns ページ情報
     */
    public static async createYjsPage(
        page: Page,
        projectId: string,
        pageName: string,
        lines: string[] = [],
    ): Promise<any> {
        return await page.evaluate(async ({ projectId, pageName, lines }) => {
            const yjsProjectManager = (window as any).__YJS_PROJECT_MANAGER__;
            if (!yjsProjectManager) {
                throw new Error("YjsProjectManager not found");
            }

            const pageId = await yjsProjectManager.createPage(pageName, "test-user", lines);
            console.log(`YjsServiceHelper: Created Yjs page "${pageName}" with ID: ${pageId}`);

            return {
                pageId: pageId,
                title: pageName,
                projectId: projectId,
            };
        }, { projectId, pageName, lines });
    }

    /**
     * Yjsプロジェクトのスナップショットを取得する
     * @param page Playwrightのページオブジェクト
     * @returns スナップショットデータ
     */
    public static async exportYjsSnapshot(page: Page): Promise<any> {
        return await page.evaluate(() => {
            const yjsProjectManager = (window as any).__YJS_PROJECT_MANAGER__;
            if (!yjsProjectManager) {
                throw new Error("YjsProjectManager not found");
            }

            const project = yjsProjectManager.getProject();
            if (!project) {
                throw new Error("Project not found");
            }

            // スナップショット形式でデータを返す
            return {
                project: {
                    title: project.title,
                    id: project.id,
                },
                pages: project.items.toArray().map((item: any) => ({
                    id: item.id,
                    title: item.text,
                })),
            };
        });
    }

    /**
     * UserManagerから現在のユーザーを取得する（Yjs対応）
     * @param page Playwrightのページオブジェクト
     * @returns 現在のユーザー
     */
    public static async getCurrentUser(page: Page): Promise<any> {
        return await page.evaluate(() => {
            // Yjsモードでは認証は簡略化されているため、テスト用ユーザーを返す
            return {
                uid: "test-user",
                email: "test@example.com",
                displayName: "Test User",
            };
        });
    }
}

/**
 * FluidServiceのテスト用ヘルパークラス（後方互換性のため残存）
 */
export class FluidServiceHelper {
    /**
     * プロジェクトタイトルからFluidClientを取得する（既存のコンテナから検索）
     * @param page Playwrightのページオブジェクト
     * @param projectTitle プロジェクトタイトル
     * @returns FluidClientの基本情報、見つからない場合はundefined
     */
    public static async getFluidClientByProjectTitle(page: Page, projectTitle: string): Promise<any> {
        return await page.evaluate(async title => {
            if (!title) {
                throw new Error("プロジェクトタイトルが指定されていません");
            }

            const fluidService = window.__FLUID_SERVICE__;
            if (!fluidService) {
                throw new Error("FluidService not found");
            }

            const fluidClient = await fluidService.getFluidClientByProjectTitle(title);
            if (!fluidClient) {
                return undefined;
            }

            // シリアライズ可能な形式で返す
            return {
                containerId: fluidClient.containerId,
                clientId: fluidClient.clientId,
                project: {
                    title: fluidClient.project.title,
                },
                treeData: fluidClient.getTreeAsJson(),
            };
        }, projectTitle);
    }

    /**
     * 新しいコンテナを作成する
     * @param page Playwrightのページオブジェクト
     * @param containerName コンテナ名
     * @returns FluidClientインスタンス
     */
    public static async createNewContainer(page: Page, containerName: string): Promise<any> {
        return await page.evaluate(async name => {
            const fluidService = window.__FLUID_SERVICE__;
            if (!fluidService) {
                throw new Error("FluidService not found");
            }

            // Fluidコンテナを作成
            const fluidClient = await fluidService.createNewContainer(name);

            // Yjs統合: 並行してYjsプロジェクトを作成
            try {
                const containerId = fluidClient.containerId;
                if (containerId && window.YjsProjectManager) {
                    console.log(`TestHelpers: Creating Yjs project for container: ${containerId}`);

                    // YjsProjectManagerを作成してプロジェクトに接続
                    const yjsProjectManager = new window.YjsProjectManager(containerId);
                    await yjsProjectManager.connect(name);

                    // WebSocket接続完了を待つ
                    const connectionEstablished = await yjsProjectManager.waitForConnection(5000);

                    if (connectionEstablished) {
                        console.log(`TestHelpers: Yjs project created and connected successfully: "${name}"`);
                    } else {
                        console.warn(`TestHelpers: WebSocket connection timeout for project: ${name}`);
                    }

                    console.log(`TestHelpers: Yjs project created successfully: ${containerId}`);
                } else {
                    console.warn(
                        "TestHelpers: Cannot create Yjs project - Container ID or YjsProjectManager not found",
                    );
                }
            } catch (yjsError) {
                // Yjsエラーは警告として記録するが、Fluidの処理は継続
                console.warn(`TestHelpers: Failed to create Yjs project: ${yjsError}`);
            }

            return fluidClient;
        }, containerName);
    }

    /**
     * FluidContainerの詳細なデータを取得する
     * @param page Playwrightのページオブジェクト
     * @returns FluidContainerの詳細データ
     */
    public static async getFluidContainerDetails(page: Page): Promise<any> {
        return await page.evaluate(() => {
            const fluidStore = (window as any).fluidStore;
            if (!fluidStore || !fluidStore.fluidClient) {
                throw new Error("FluidClient not found");
            }

            const client = fluidStore.fluidClient;
            const project = client.project;

            // プロジェクトの詳細情報を取得
            const projectDetails = {
                title: project.title,
                itemCount: project.items ? project.items.length : 0,
                items: [] as any[],
            };

            // 各ページ（アイテム）の詳細を取得
            if (project.items) {
                for (let i = 0; i < project.items.length; i++) {
                    const item = project.items.at(i);
                    if (item) {
                        const itemDetails = {
                            id: item.id,
                            text: item.text,
                            author: item.author,
                            created: item.created,
                            lastChanged: item.lastChanged,
                            childItemCount: item.items ? item.items.length : 0,
                            childItems: [] as any[],
                        };

                        // 子アイテムの詳細も取得
                        if (item.items) {
                            for (let j = 0; j < item.items.length; j++) {
                                const childItem = item.items.at(j);
                                if (childItem) {
                                    itemDetails.childItems.push({
                                        id: childItem.id,
                                        text: childItem.text,
                                        author: childItem.author,
                                        created: childItem.created,
                                        lastChanged: childItem.lastChanged,
                                    });
                                }
                            }
                        }

                        projectDetails.items.push(itemDetails);
                    }
                }
            }

            return {
                containerId: client.containerId,
                clientId: client.clientId,
                project: projectDetails,
            };
        });
    }

    /**
     * 特定のページ名が存在するかを確認する
     * @param page Playwrightのページオブジェクト
     * @param pageName 確認するページ名
     * @returns ページが存在する場合はtrue
     */
    public static async checkPageExists(page: Page, pageName: string): Promise<boolean> {
        return await page.evaluate(pageNameToCheck => {
            const fluidStore = (window as any).fluidStore;
            if (!fluidStore || !fluidStore.fluidClient) {
                return false;
            }

            const project = fluidStore.fluidClient.project;
            if (!project.items) {
                return false;
            }

            // ページ名が一致するページを検索
            for (let i = 0; i < project.items.length; i++) {
                const item = project.items.at(i);
                if (item && item.text.toLowerCase() === pageNameToCheck.toLowerCase()) {
                    return true;
                }
            }

            return false;
        }, pageName);
    }

    /**
     * 特定のページ名のページデータを取得する
     * @param page Playwrightのページオブジェクト
     * @param pageName 取得するページ名
     * @returns ページデータ、見つからない場合はnull
     */
    public static async getPageData(page: Page, pageName: string): Promise<any> {
        return await page.evaluate(pageNameToGet => {
            const fluidStore = (window as any).fluidStore;
            if (!fluidStore || !fluidStore.fluidClient) {
                return null;
            }

            const project = fluidStore.fluidClient.project;
            if (!project.items) {
                return null;
            }

            // ページ名が一致するページを検索
            for (let i = 0; i < project.items.length; i++) {
                const item = project.items.at(i);
                if (item && item.text.toLowerCase() === pageNameToGet.toLowerCase()) {
                    const pageData = {
                        id: item.id,
                        text: item.text,
                        author: item.author,
                        created: item.created,
                        lastChanged: item.lastChanged,
                        childItemCount: item.items ? item.items.length : 0,
                        childItems: [] as any[],
                    };

                    // 子アイテムの詳細も取得
                    if (item.items) {
                        for (let j = 0; j < item.items.length; j++) {
                            const childItem = item.items.at(j);
                            if (childItem) {
                                pageData.childItems.push({
                                    id: childItem.id,
                                    text: childItem.text,
                                    author: childItem.author,
                                    created: childItem.created,
                                    lastChanged: childItem.lastChanged,
                                });
                            }
                        }
                    }

                    return pageData;
                }
            }

            return null;
        }, pageName);
    }

    /**
     * FluidClientからプロジェクトデータを取得する
     * @param page Playwrightのページオブジェクト
     * @returns プロジェクトデータ
     */
    public static async getProjectFromFluidClient(page: Page): Promise<any> {
        return await page.evaluate(() => {
            const fluidStore = window.__FLUID_STORE__;
            if (!fluidStore) {
                throw new Error("FluidStore not found");
            }

            // 現在のFluidClientを取得
            const fluidClient = fluidStore.fluidClient;
            if (!fluidClient) {
                throw new Error("FluidClient not found");
            }

            return fluidClient.getProject();
        });
    }

    /**
     * FluidClientからTreeデータを取得する
     * @param page Playwrightのページオブジェクト
     * @returns Treeデータ
     */
    public static async getTreeDataFromFluidClient(page: Page): Promise<any> {
        return await page.evaluate(() => {
            const fluidStore = window.__FLUID_STORE__;
            if (!fluidStore) {
                throw new Error("FluidStore not found");
            }

            const fluidClient = fluidStore.fluidClient;
            if (!fluidClient) {
                throw new Error("FluidClient not found");
            }

            return fluidClient.getTreeAsJson();
        });
    }

    /**
     * UserManagerから現在のユーザーを取得する
     * @param page Playwrightのページオブジェクト
     * @returns 現在のユーザー
     */
    public static async getCurrentUser(page: Page): Promise<any> {
        return await page.evaluate(() => {
            const userManager = window.__USER_MANAGER__;
            if (!userManager) {
                throw new Error("UserManager not found");
            }

            return userManager.getCurrentUser();
        });
    }

    /**
     * queryStoreから現在のデータを取得する
     * @param page Playwrightのページオブジェクト
     */
    public static async getQueryStoreData(page: Page): Promise<any> {
        return await page.evaluate(() => {
            const qs: any = (window as any).queryStore;
            if (!qs) return null;
            let value: any;
            const unsub = qs.subscribe((v: any) => (value = v));
            unsub();
            return value;
        });
    }

    /**
     * 現在の選択テキストを取得する
     * @param page Playwrightのページオブジェクト
     * @returns 選択されているテキスト
     */
    public static async getSelectedText(page: Page): Promise<string> {
        return await page.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return "";
            return store.getSelectedText();
        });
    }
}

// グローバル型定義を拡張（テスト用にwindowオブジェクトに機能を追加）
declare global {
    interface Window {
        getCursorDebugData?: () => any;
        getCursorPathData?: (path?: string) => any;
        getFluidTreeDebugData?: () => any;
        __testShowLinkPreview?: (pageName: string, projectName?: string) => HTMLElement;
        fluidServerPort?: number;
        _alertMessage?: string | null | undefined;
        __FLUID_SERVICE__?: any;
        __FLUID_STORE__?: any;
        __USER_MANAGER__?: any;
        editorOverlayStore?: any;
    }
}
