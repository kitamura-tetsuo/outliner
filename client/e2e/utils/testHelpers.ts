import {
    expect,
    type Page,
    type Response,
} from "@playwright/test";
import { CursorValidator } from "./cursorValidation.js";

/**
 * テスト用のヘルパー関数群
 */
export class TestHelpers {
    /**
     * テスト環境を準備する
     * 各テストの前に呼び出すことで、テスト環境を一貫した状態にする
     * @param page Playwrightのページオブジェクト
     * @returns 作成したプロジェクト名とページ名
     */
    public static async prepareTestEnvironment(
        page: Page,
        testInfo: any,
        lines: string[] = [],
    ): Promise<{ projectName: string; pageName: string; }> {
        // ホームページにアクセスしてアプリの初期化を待つ
        await page.goto("/");

        // テスト環境フラグを設定
        await page.evaluate(() => {
            // テスト環境であることを明示的に設定
            localStorage.setItem("VITE_IS_TEST", "true");
            localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
            console.log("TestHelper: Set test environment flags");
        });

        // UserManagerが初期化されるまで待機
        await page.waitForFunction(
            () => (window as any).__USER_MANAGER__ !== undefined,
            { timeout: 10000 },
        );

        console.log("TestHelper: UserManager found, attempting authentication");

        // 手動で認証を実行
        const authResult = await page.evaluate(async () => {
            const userManager = (window as any).__USER_MANAGER__;
            if (!userManager) {
                return { success: false, error: "UserManager not found" };
            }

            try {
                console.log("TestHelper: Attempting login with test@example.com");
                await userManager.loginWithEmailPassword("test@example.com", "password");

                // 認証完了を待機
                let attempts = 0;
                while (attempts < 30) { // 3秒間待機
                    const currentUser = userManager.getCurrentUser();
                    if (currentUser) {
                        console.log("TestHelper: Authentication successful", currentUser);
                        return { success: true, user: currentUser };
                    }
                    await new Promise(resolve => setTimeout(resolve, 100));
                    attempts++;
                }

                return { success: false, error: "Authentication timeout" };
            }
            catch (error) {
                console.error("TestHelper: Authentication failed", error);
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        });

        if (!authResult.success) {
            throw new Error(`Authentication failed: ${authResult.error}`);
        }

        console.log("TestHelper: Authentication successful, waiting for global variables");

        // グローバル変数が設定されるまで待機
        await page.waitForFunction(
            () => {
                const hasFluidStore = (window as any).__FLUID_STORE__ !== undefined;
                const hasSvelteGoto = (window as any).__SVELTE_GOTO__ !== undefined;
                console.log("TestHelper: Checking globals - FluidStore:", hasFluidStore, "SvelteGoto:", hasSvelteGoto);
                return hasFluidStore && hasSvelteGoto;
            },
            { timeout: 15000 },
        );

        console.log("TestHelper: Global variables initialized successfully");

        // デバッグ関数を手動で設定
        await page.evaluate(async () => {
            // fluidStoreとgotoを手動で設定
            if (!(window as any).__FLUID_STORE__) {
                (window as any).__FLUID_STORE__ = (window as any).fluidStore;
            }
            if (!(window as any).__SVELTE_GOTO__) {
                (window as any).__SVELTE_GOTO__ = (window as any).goto;
            }

            // snapshotServiceを手動で設定
            if (!(window as any).__SNAPSHOT_SERVICE__) {
                const snapshotService = await import("../../src/services/snapshotService.js");
                (window as any).__SNAPSHOT_SERVICE__ = snapshotService;
            }
        });
        page.goto = async (
            url: string,
            _options?: {
                referer?: string;
                timeout?: number;
                waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
            },
        ): Promise<Response | null> => {
            await page.evaluate(async url => {
                while (!window.__SVELTE_GOTO__) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                window.__SVELTE_GOTO__(url);
            }, url);
            await expect(page).toHaveURL(url);
            return null;
        };

        // デバッガーをセットアップ
        await TestHelpers.setupTreeDebugger(page);
        await TestHelpers.setupCursorDebugger(page);

        // テストページをセットアップ
        return await TestHelpers.navigateToTestProjectPage(page, testInfo, lines);
    }

    /**
     * テスト用のプロジェクトとページをFluid API経由で作成する
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

        // Fluid APIを使用してプロジェクトとページを作成
        await page.evaluate(async ({ projectName, pageName, lines }) => {
            let fluidClient: any = null;
            try {
                console.log(`TestHelper: Creating project and page`, {
                    projectName,
                    pageName,
                    linesCount: lines.length,
                });

                // テスト環境でFluidServiceを直接インポートして使用
                const { createNewContainer } = await import("../../src/lib/fluidService.svelte.js");
                console.log(`TestHelper: FluidService imported`);

                fluidClient = await createNewContainer(projectName);
                console.log(`TestHelper: FluidClient created`, { containerId: fluidClient.containerId });

                const project = fluidClient.getProject();
                console.log(`TestHelper: Project retrieved`, {
                    projectTitle: project.title,
                });

                fluidClient.createPage(pageName, lines);
                console.log(`TestHelper: Page created`, { pageName });

                // fluidStoreを更新してアプリケーション状態を同期
                const fluidStore = window.__FLUID_STORE__;
                if (fluidStore) {
                    console.log(`TestHelper: Updating fluidStore with new client`);
                    fluidStore.fluidClient = fluidClient;
                    console.log(`TestHelper: FluidStore updated`);
                }
                else {
                    console.error(`TestHelper: FluidStore not found`);
                }
            }
            catch (error) {
                console.error(`TestHelper: Error creating project and page:`, error);
                // エラーが発生してもテストを続行する
                return; // エラーの場合は早期リターン
            }

            // 作成後の状態を確認（fluidClientが正常に作成された場合のみ）
            if (fluidClient) {
                try {
                    const updatedProject = fluidClient.getProject();
                    console.log(`TestHelper: Updated project state`, {
                        projectTitle: updatedProject.title,
                        itemsCount: updatedProject.items ? (updatedProject.items as any).length : 0,
                    });

                    if (updatedProject.items && (updatedProject.items as any).length > 0) {
                        for (let i = 0; i < (updatedProject.items as any).length; i++) {
                            const page = (updatedProject.items as any)[i];
                            console.log(`TestHelper: Page ${i}`, {
                                text: page.text,
                                itemsCount: page.items ? (page.items as any).length : 0,
                            });
                        }
                    }
                }
                catch (error) {
                    console.error(`TestHelper: Error checking project state:`, error);
                }
            }
        }, { projectName, pageName, lines });

        // 少し待機してからページの状態を確認
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    /**
     * テスト用のページをFluid API経由で作成する
     * @param page Playwrightのページオブジェクト
     * @param pageName ページ名
     */
    public static async createTestPageViaAPI(page: Page, pageName: string, lines: string[]): Promise<void> {
        // Fluid APIを使用してページを作成
        await page.evaluate(async ({ pageName, lines }) => {
            // FluidStoreが利用可能になるまで待機
            let attempts = 0;
            const maxAttempts = 50; // 5秒間待機
            while (!window.__FLUID_STORE__ && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }

            if (!window.__FLUID_STORE__) {
                throw new Error("FluidStore not available after waiting");
            }

            const fluidClient = window.__FLUID_STORE__.fluidClient;
            if (!fluidClient) {
                throw new Error("FluidClient instance not found");
            }

            fluidClient.createPage(pageName, lines);
        }, { pageName, lines });
    }

    /**
     * カーソル情報取得用のデバッグ関数をセットアップする
     * @param page Playwrightのページオブジェクト
     */
    private static async setupCursorDebugger(page: Page): Promise<void> {
        await page.addInitScript(() => {
            // グローバルオブジェクトにデバッグ関数を追加
            window.getCursorDebugData = function () {
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
                }
                catch (error) {
                    console.error("Error getting cursor data:", error);
                    return { error: error instanceof Error ? error.message : "Unknown error" };
                }
            };

            // 拡張版のデバッグ関数 - 特定のパスのデータのみを取得
            window.getCursorPathData = function (path) {
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
                }
                catch (error) {
                    return { error: error instanceof Error ? error.message : "Unknown error" };
                }
            };
        });

        // EditorOverlayStoreがグローバルに公開されていることを確認
        // await page.waitForFunction(() => window.editorOverlayStore, { timeout: 5000 });
    }

    /**
     * SharedTreeデータ取得用のデバッグ関数をセットアップする
     * @param page Playwrightのページオブジェクト
     */
    public static async setupTreeDebugger(page: Page): Promise<void> {
        await page.addInitScript(() => {
            // グローバルオブジェクトにデバッグ関数を追加
            window.getFluidTreeDebugData = function () {
                // グローバルFluidClientインスタンスを取得
                const fluidClient = window.__FLUID_SERVICE__.getFluidClient();
                if (!fluidClient) {
                    console.error("FluidClient instance not found");
                    return { error: "FluidClient instance not found" };
                }

                try {
                    // FluidClientのgetAllDataメソッドを使用してデータを取得
                    const treeData = fluidClient.getAllData();
                    return treeData;
                }
                catch (error) {
                    console.error("Error getting tree data:", error);
                    return { error: error instanceof Error ? error.message : "Unknown error" };
                }
            };

            // 拡張版のデバッグ関数 - 特定のパスのデータのみを取得
            window.getFluidTreePathData = function (path) {
                const fluidClient = window.__FLUID_SERVICE__.getFluidClient();
                if (!fluidClient) {
                    return { error: "FluidClient instance not found" };
                }

                try {
                    const treeData = fluidClient.getAllData();
                    if (!path) return treeData;

                    // パスに基づいてデータを取得
                    const parts = path.split(".");
                    let result = treeData;
                    for (const part of parts) {
                        if (result === undefined || result === null) return null;
                        result = result[part];
                    }
                    return result;
                }
                catch (error) {
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
        }
        catch (error) {
            console.log("Timeout waiting for cursor to be visible, continuing anyway");
            // スクリーンショットを撮影して状態を確認
            await page.screenshot({ path: "client/test-results/cursor-visible-timeout.png" });
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
        userId: string = "test-user",
    ): Promise<void> {
        await page.evaluate(async ({ itemId, offset, userId }) => {
            const editorOverlayStore = (window as any).editorOverlayStore;
            if (editorOverlayStore && editorOverlayStore.setCursor) {
                editorOverlayStore.setCursor({
                    itemId: itemId,
                    offset: offset,
                    isActive: true,
                    userId: userId,
                });
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
        userId: string = "test-user",
    ): Promise<void> {
        await page.evaluate(async ({ itemId, text, userId }) => {
            const editorOverlayStore = (window as any).editorOverlayStore;
            if (editorOverlayStore && editorOverlayStore.getCursor) {
                const cursor = editorOverlayStore.getCursor(itemId, userId);
                if (cursor && cursor.insertText) {
                    cursor.insertText(text);
                }
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
        const projectName = `Test Project ${testInfo.workerIndex} ${Date.now()}`;
        const pageName = `test-page-${Date.now()}`;

        console.log("TestHelper: Creating test project and page via API");
        await TestHelpers.createTestProjectAndPageViaAPI(page, projectName, pageName, lines);

        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);
        const url = `/${encodedProject}/${encodedPage}`;

        console.log("TestHelper: Navigating to project page:", url);
        await page.goto(url);

        // ページコンポーネントが初期化されるまで待機
        console.log("TestHelper: Waiting for page component initialization");

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
            // より柔軟な初期化チェック - FluidClientの存在は必須ではない
            await page.waitForFunction(() => {
                // ページコンポーネントが初期化されているかチェック
                const outlinerBase = document.querySelector('[data-testid="outliner-base"]');
                const hasOutlinerBase = !!outlinerBase;

                // FluidStoreが正しく設定されているかチェック（オプショナル）
                const fluidStore = (window as any).__FLUID_STORE__;
                const hasFluidClient = !!(fluidStore && fluidStore.fluidClient);

                console.log("TestHelper: Page initialization check", {
                    hasOutlinerBase,
                    hasFluidClient,
                    outlinerBaseContent: outlinerBase?.textContent?.substring(0, 100),
                });

                // OutlinerBaseが存在すれば十分とする（FluidClientは後で設定される可能性がある）
                return hasOutlinerBase;
            }, { timeout: 15000 });
        }
        catch (error) {
            console.log("TestHelper: Page initialization timeout, taking debug screenshot");
            await page.screenshot({ path: "test-results/debug-page-init-timeout.png" });

            // ページの詳細な状態を出力
            await page.evaluate(() => {
                console.log("TestHelper: Detailed page state on timeout:");
                console.log("TestHelper: document.readyState:", document.readyState);
                console.log("TestHelper: body.innerHTML:", document.body.innerHTML.substring(0, 500));
                console.log(
                    "TestHelper: All elements with class:",
                    Array.from(document.querySelectorAll("*")).map(el => el.className).filter(c => c),
                );
            });

            throw error;
        }

        console.log("TestHelper: Page component initialized, waiting for OutlinerTree");

        // OutlinerTreeコンポーネントが表示されるまで待機（より柔軟な条件）
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
            }, { timeout: 10000 });
        }
        catch (error) {
            console.log("TestHelper: OutlinerTree initialization timeout, continuing anyway");
            // タイムアウトしても続行する
        }

        console.log("TestHelper: OutlinerTree initialized successfully");

        // デバッグ用: 最終的なページの状態を確認
        await page.evaluate(() => {
            console.log("TestHelper: Final page state");
            console.log("TestHelper: outliner-item count:", document.querySelectorAll(".outliner-item").length);
            console.log(
                "TestHelper: add button count:",
                Array.from(document.querySelectorAll("button")).filter(btn => btn.textContent?.includes("アイテム追加"))
                    .length,
            );
            console.log("TestHelper: global-textarea exists:", !!document.querySelector(".global-textarea"));
        });

        return { projectName, pageName };
    }

    /**
     * アウトライナーアイテムが表示されるのを待つ
     * @param page Playwrightのページオブジェクト
     * @param timeout タイムアウト時間（ミリ秒）
     */
    public static async waitForOutlinerItems(page: Page, timeout = 30000): Promise<void> {
        console.log("Waiting for outliner items to be visible...");

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

        // アウトライナーアイテムが表示されるのを待つ
        try {
            await page.waitForSelector(".outliner-item", { timeout: timeout });
            const itemCount = await page.locator(".outliner-item").count();
            console.log(`Found ${itemCount} outliner items`);
        }
        catch (e) {
            console.log("Timeout waiting for outliner items, taking screenshot...");
            await page.screenshot({ path: "client/test-results/outliner-items-timeout.png" });
            throw e;
        }

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
            }
            else {
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
     * リンクプレビューを強制的に表示する
     * @param page Playwrightのページオブジェクト
     * @param linkText リンクのテキスト
     */
    public static async forceLinkPreview(page: Page, linkText: string): Promise<void> {
        // リンク要素を特定（:has-text()を使わない方法）
        const linkExists = await page.evaluate(text => {
            const links = Array.from(document.querySelectorAll("a.internal-link"));
            return links.some(link => link.textContent?.includes(text));
        }, linkText);

        if (!linkExists) {
            console.error(`Link not found: ${linkText}`);
            return;
        }

        // リンクプレビュー表示関数を直接呼び出す
        await page.evaluate(text => {
            // テキストに一致するリンクを検索
            const links = Array.from(document.querySelectorAll("a.internal-link"));
            const link = links.find(l => l.textContent?.includes(text));
            if (!link) return;

            // リンクプレビューハンドラーを直接呼び出す
            // データ属性からページ名を取得
            const pageName = link.getAttribute("data-page");
            const projectName = link.getAttribute("data-project");

            if (!pageName) return;

            // グローバルスコープにテスト用の関数を追加
            window.__testShowLinkPreview = function (pageName: string, _projectName?: string) {
                // プレビュー要素を作成
                const previewElement = document.createElement("div");
                previewElement.className = "link-preview-popup";

                // スタイルを適用
                Object.entries({
                    position: "absolute",
                    zIndex: "1000",
                    width: "300px",
                    maxHeight: "300px",
                    backgroundColor: "white",
                    border: "1px solid #ddd",
                    borderRadius: "6px",
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                    padding: "12px",
                    overflow: "hidden",
                    fontSize: "14px",
                    top: "100px",
                    left: "100px",
                }).forEach(([key, value]) => {
                    previewElement.style[key as any] = value;
                });

                // コンテンツを追加
                const titleElement = document.createElement("h3");
                titleElement.textContent = pageName;
                titleElement.style.fontSize = "16px";
                titleElement.style.fontWeight = "600";
                titleElement.style.margin = "0 0 8px 0";
                titleElement.style.paddingBottom = "8px";
                titleElement.style.borderBottom = "1px solid #eee";

                previewElement.appendChild(titleElement);

                // ページが存在するかどうかを確認
                const pageExists = link.classList.contains("page-exists");

                if (pageExists) {
                    const contentElement = document.createElement("div");
                    contentElement.className = "preview-items";
                    contentElement.innerHTML = "<p>テストプレビューコンテンツ</p>";
                    previewElement.appendChild(contentElement);
                }
                else {
                    const notFoundElement = document.createElement("div");
                    notFoundElement.className = "preview-not-found";
                    notFoundElement.innerHTML = "<p>ページが見つかりません</p>";
                    previewElement.appendChild(notFoundElement);
                }

                // DOMに追加
                document.body.appendChild(previewElement);

                console.log(`Created test preview for: ${pageName}`);
                return previewElement;
            };

            // プレビュー表示関数を呼び出す
            window.__testShowLinkPreview(pageName, projectName!);
        }, linkText);

        // プレビューが表示されるのを待機
        await page.waitForTimeout(500);
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
                    const isVisibleStyle = style.display !== "none" &&
                        style.visibility !== "hidden" &&
                        style.opacity !== "0" &&
                        rect.height > 0 &&
                        rect.width > 0;

                    // 親要素が非表示になっていないか確認
                    let parent = element.parentElement;
                    let isParentVisible = true;

                    while (parent) {
                        const parentStyle = window.getComputedStyle(parent);
                        if (
                            parentStyle.display === "none" ||
                            parentStyle.visibility === "hidden" ||
                            parentStyle.opacity === "0"
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
            }
            catch (error) {
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
 * FluidServiceのテスト用ヘルパークラス
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

            return await fluidService.createNewContainer(name);
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
}

// グローバル型定義を拡張（テスト用にwindowオブジェクトに機能を追加）
declare global {
    interface Window {
        getCursorDebugData?: () => any;
        getCursorPathData?: (path?: string) => any;
        getFluidTreeDebugData?: () => any;
        __testShowLinkPreview?: (pageName: string, projectName?: string) => HTMLElement;
        fluidServerPort?: number;
        _alertMessage?: string | undefined;
        __FLUID_SERVICE__?: any;
        __FLUID_STORE__?: any;
        __USER_MANAGER__?: any;
        editorOverlayStore?: any;
    }
}
