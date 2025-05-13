import type { Page } from '@playwright/test';

/**
 * テストページをセットアップする
 * @param page Playwrightのページオブジェクト
 * @param path オプションのパス（デフォルトは "/"）
 */
export async function setupTestPage(page: Page): Promise<void> {
    // 認証状態を設定
    await page.addInitScript(() => {
        window.localStorage.setItem("authenticated", "true");

        // アラートを上書き
        window.alert = function (message) {
            window._alertMessage = message;
            console.log("Alert:", message);
        };
    });

    // 環境に応じたURLでアプリを開く
    await page.goto("/");

    // ページが読み込まれるのを待つ（bodyタグが表示されるのを待つ）
    await page.waitForSelector("body", { timeout: 10000 });

    // ページタイトルが存在することを確認（表示状態は確認しない）
    await page.waitForSelector("title", { state: "attached", timeout: 10000 });
}

/**
 * カーソルが表示されるのを待つ
 * @param page Playwrightのページオブジェクト
 */
export async function waitForCursorVisible(page: Page): Promise<void> {
    await page.waitForSelector('.cursor', { state: 'visible' });
}

/**
 * SharedTreeデータ取得用のデバッグ関数をセットアップする
 * @param page Playwrightのページオブジェクト
 */
export async function setupTreeDebugger(page: Page): Promise<void> {
    await page.addInitScript(() => {
        // グローバルオブジェクトにデバッグ関数を追加
        window.getFluidTreeDebugData = function() {
            // グローバルFluidClientインスタンスを取得
            const fluidClient = window.__FLUID_CLIENT__;
            if (!fluidClient) {
                console.error("FluidClient instance not found");
                return { error: "FluidClient instance not found" };
            }

            try {
                // FluidClientのgetAllDataメソッドを使用してデータを取得
                const treeData = fluidClient.getAllData();
                return treeData;
            } catch (error) {
                console.error("Error getting tree data:", error);
                return { error: error.message || "Unknown error" };
            }
        };

        // 拡張版のデバッグ関数 - 特定のパスのデータのみを取得
        window.getFluidTreePathData = function(path) {
            const fluidClient = window.__FLUID_CLIENT__;
            if (!fluidClient) {
                return { error: "FluidClient instance not found" };
            }

            try {
                const treeData = fluidClient.getAllData();
                if (!path) return treeData;

                // パスに基づいてデータを取得
                const parts = path.split('.');
                let result = treeData;
                for (const part of parts) {
                    if (result === undefined || result === null) return null;
                    result = result[part];
                }
                return result;
            } catch (error) {
                return { error: error.message || "Unknown error" };
            }
        };
    });
}

/**
 * テスト用のアイテムを作成する
 * @param page Playwrightのページオブジェクト
 * @param texts 作成するアイテムのテキスト配列
 */
export async function createTestItems(page: Page, texts: string[]): Promise<void> {
    // 最初のアイテムをクリックして選択
    await page.locator(".outliner-item").first().click();
    await page.waitForTimeout(100);

    // 各テキストを入力
    for (let i = 0; i < texts.length; i++) {
        await page.keyboard.type(texts[i]);
        if (i < texts.length - 1) {
            await page.keyboard.press("Enter");
            await page.waitForTimeout(100);
        }
    }
}

/**
 * テスト用のプロジェクトとページを作成する（UI経由）
 * @param page Playwrightのページオブジェクト
 * @param projectName プロジェクト名
 * @param pageName ページ名
 * @deprecated UI経由での作成は不安定なため、createTestProjectAndPageViaAPI を使用してください
 */
export async function createTestProjectAndPage(page: Page, projectName: string, pageName: string): Promise<void> {
    // ホームページにアクセス
    await setupTestPage(page);

    // 新規コンテナ作成ページに移動
    await page.click("text=新しいアウトライナーを作成");
    await page.waitForSelector("input[placeholder='アウトライナー名を入力']");

    // プロジェクト名を入力
    await page.fill("input[placeholder='アウトライナー名を入力']", projectName);
    await page.click("text=作成");

    // ページが読み込まれるのを待つ
    await page.waitForSelector(".outliner-item");

    // 最初のアイテムをクリックして選択
    await page.locator(".outliner-item").first().click();
    await waitForCursorVisible(page);

    // ページ名を入力
    await page.keyboard.type(pageName);
    await page.keyboard.press("Enter");
    await waitForCursorVisible(page);

    // ページの内容を入力
    await page.keyboard.type("これはテスト用のページです。");
    await page.keyboard.press("Enter");
    await waitForCursorVisible(page);
    await page.keyboard.type("内部リンクのテスト: [test-link]");

    // 少し待機してデータが保存されるのを待つ
    await page.waitForTimeout(1000);
}

/**
 * テスト用のプロジェクトとページをFluid API経由で作成する
 * @param page Playwrightのページオブジェクト
 * @param projectName プロジェクト名
 * @param pageName ページ名
 */
export async function createTestProjectAndPageViaAPI(page: Page, projectName: string, pageName: string): Promise<void> {
    // まずテストページをセットアップ（基本的なページを表示）
    await setupTestPage(page);

    // TreeDebuggerをセットアップ
    await setupTreeDebugger(page);

    // Fluid APIを使用してプロジェクトとページを作成
    await page.evaluate(({ projectName, pageName }) => {
        // グローバルFluidClientインスタンスを取得
        const fluidClient = window.__FLUID_CLIENT__;
        if (!fluidClient) {
            throw new Error("FluidClient instance not found");
        }

        try {
            // プロジェクトとページのデータを取得
            const appData = fluidClient.appData;
            const project = appData.root;

            // プロジェクト名を設定
            project.title = projectName;

            // 既存のページを取得
            const existingItems = project.items;
            if (existingItems && existingItems.length > 0) {
                // 最初のページのテキストを更新
                const firstPage = existingItems[0];
                firstPage.updateText(pageName);

                // 内部リンクを含むテキストを追加
                const pageItems = firstPage.items;
                if (pageItems) {
                    // 既存のアイテムをクリア
                    while (pageItems.length > 0) {
                        pageItems.removeAt(0);
                    }

                    // 新しいアイテムを追加
                    const item1 = pageItems.addNode("test-user");
                    item1.updateText("これはテスト用のページです。");

                    const item2 = pageItems.addNode("test-user");
                    item2.updateText("内部リンクのテスト: [test-link]");
                }
            }

            return { success: true };
        } catch (error) {
            console.error("Error creating project and page:", error);
            throw error;
        }
    }, { projectName, pageName });

    // 少し待機してデータが保存されるのを待つ
    await page.waitForTimeout(1000);
}

/**
 * カーソル情報取得用のデバッグ関数をセットアップする
 * @param page Playwrightのページオブジェクト
 */
export async function setupCursorDebugger(page: Page): Promise<void> {
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
                        userId: cursor.userId
                    });
                });

                return {
                    cursors,
                    selections,
                    activeItemId,
                    cursorVisible,
                    cursorInstances,
                    cursorCount: cursors.length,
                    selectionCount: selections.length
                };
            } catch (error) {
                console.error("Error getting cursor data:", error);
                return { error: error.message || "Unknown error" };
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
                const parts = path.split('.');
                let result = cursorData;
                for (const part of parts) {
                    if (result === undefined || result === null) return null;
                    result = result[part];
                }
                return result;
            } catch (error) {
                return { error: error.message || "Unknown error" };
            }
        };
    });

    // EditorOverlayStoreがグローバルに公開されていることを確認
    await page.waitForFunction(() => window.editorOverlayStore, { timeout: 5000 });
}

/**
 * テスト環境を準備する
 * 各テストの前に呼び出すことで、テスト環境を一貫した状態にする
 * @param page Playwrightのページオブジェクト
 */
export async function prepareTestEnvironment(page: Page): Promise<void> {
    // テストページをセットアップ
    await setupTestPage(page);

    // デバッガーをセットアップ
    await setupTreeDebugger(page);
    await setupCursorDebugger(page);

    // FluidClientインスタンスが初期化されるのを待つ
    await page.waitForFunction(() => window.__FLUID_CLIENT__, { timeout: 30000 });

    // ページが完全に読み込まれるのを待つ
    await page.waitForTimeout(1000);
}

/**
 * テスト用のプロジェクトとページを準備する
 * @param page Playwrightのページオブジェクト
 * @param projectName プロジェクト名
 * @param pageName ページ名
 * @param content ページの内容
 * @param navigateToPage 作成後にページに移動するかどうか
 */
export async function prepareTestProjectAndPage(
    page: Page,
    projectName: string,
    pageName: string,
    content: string[] = ["これはテスト用のページです。", "内部リンクのテスト: [test-link]"],
    navigateToPage: boolean = true
): Promise<void> {
    // テスト環境を準備
    await prepareTestEnvironment(page);

    // Fluid APIを使用してプロジェクトとページを作成
    const result = await page.evaluate(({ projectName, pageName, content }) => {
        // グローバルFluidClientインスタンスを取得
        const fluidClient = window.__FLUID_CLIENT__;
        if (!fluidClient) {
            return { success: false, error: "FluidClient instance not found" };
        }

        try {
            // プロジェクトとページのデータを取得
            const appData = fluidClient.appData;
            const rootProject = appData.root;

            // プロジェクトを検索または作成
            let project: any = null;

            // 既存のプロジェクトを検索
            if (rootProject.items && rootProject.items.length > 0) {
                for (let i = 0; i < rootProject.items.length; i++) {
                    const p = rootProject.items[i];
                    if (p.text === projectName) {
                        project = p;
                        break;
                    }
                }
            }

            // プロジェクトが見つからない場合は新規作成
            if (!project) {
                project = rootProject.items.addNode("test-user");
                project.updateText(projectName);
            }

            // ページを検索または作成
            let page: any = null;

            // 既存のページを検索
            if (project && project.items && project.items.length > 0) {
                for (let i = 0; i < project.items.length; i++) {
                    const p = project.items[i];
                    if (p && p.text === pageName) {
                        page = p;
                        break;
                    }
                }
            }

            // ページが見つからない場合は新規作成
            if (!page && project && project.items) {
                page = project.items.addNode("test-user");
                if (page) {
                    page.updateText(pageName);
                }
            }

            // ページの内容を設定
            const pageItems = page && page.items ? page.items : null;

            // 既存のアイテムをクリア
            if (pageItems) {
                while (pageItems.length > 0) {
                    pageItems.removeAt(0);
                }

                // 新しいアイテムを追加
                for (const text of content) {
                    const item = pageItems.addNode("test-user");
                    if (item) {
                        item.updateText(text);
                    }
                }
            }

            if (!project || !page) {
                return {
                    success: false,
                    error: "Failed to create project or page"
                };
            }

            return {
                success: true,
                projectId: project.id,
                pageId: page.id
            };
        } catch (error) {
            console.error("Error creating project and page:", error);
            return {
                success: false,
                error: error.message || "Unknown error"
            };
        }
    }, { projectName, pageName, content });

    // エラーチェック
    if (!result.success) {
        console.error(`ページ作成に失敗しました: ${result.error}`);
        throw new Error(`ページ作成に失敗しました: ${result.error}`);
    }

    console.log(`テストページ「${projectName}/${pageName}」を作成しました (ID: ${result.pageId})`);

    // 作成したページに移動する場合
    if (navigateToPage) {
        await page.goto(`/${projectName}/${pageName}`);
        await page.waitForTimeout(1000);

        // ページが正しく読み込まれたことを確認（タイムアウトを延長）
        try {
            await page.waitForSelector(".outliner-item", { timeout: 20000 });
        } catch (error) {
            console.warn("Warning: Timeout waiting for .outliner-item after page creation. Continuing anyway.");
            // スクリーンショットを撮影して状態を確認
            await page.screenshot({ path: `test-results/page-creation-timeout-${projectName}-${pageName}.png` });
        }

        // 内部リンクを含むコンテンツの場合、リンクを強制的に表示
        const hasInternalLinks = content.some(text => text.includes('[') && text.includes(']'));
        if (hasInternalLinks) {
            try {
                // 内部リンクを強制的に表示
                await page.evaluate(() => {
                    // 全てのアウトライナーアイテムを取得
                    const items = document.querySelectorAll('.outliner-item');
                    console.log(`Found ${items.length} outliner items for internal links`);

                    // 各アイテムのテキストを再レンダリング
                    items.forEach((item) => {
                        const textElement = item.querySelector('.item-text');
                        if (textElement) {
                            // テキスト内容を取得
                            const text = textElement.textContent || "";

                            // 内部リンクのパターンを検出
                            if (text.includes('[') && text.includes(']')) {
                                // フォーマット済みクラスを追加して強制的にレンダリング
                                textElement.classList.add('formatted');
                            }
                        }
                    });
                });

                // リンクが表示されるのを待つ
                await page.waitForTimeout(500);
            } catch (error) {
                console.warn("内部リンクの強制表示に失敗しました:", error);
            }
        }
    }
}

// グローバル型定義を拡張（テスト用にwindowオブジェクトに機能を追加）
declare global {
    interface Window {
        mockFluidClient?: boolean;
        mockUser?: { id: string; name: string; email?: string; };
        mockFluidToken?: { token: string; user: { id: string; name: string; }; };
        getFluidTreeDebugData?: () => any;
        getFluidTreePathData?: (path?: string) => any;
        getCursorDebugData?: () => any;
        getCursorPathData?: (path?: string) => any;
        fluidServerPort?: number;
        _alertMessage?: string | null;
        __FLUID_CLIENT__?: any;
        editorOverlayStore?: any;
    }
}
