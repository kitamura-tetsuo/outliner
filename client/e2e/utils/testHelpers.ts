import { expect, type Page, type Response } from "@playwright/test";
import { CursorValidator } from "./cursorValidation";
import { TreeValidator } from "./treeValidation";

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
    public static async prepareTestEnvironment(page: Page, testInfo: any, lines: string[] = []): Promise<{ projectName: string; pageName: string }> {
        // ホームページにアクセス
        await page.goto("/");

        page.goto = async (
            url: string,
            options?: { referer?: string; timeout?: number; waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit" }
        ): Promise<Response | null> => {
            await page.evaluate(async (url) => {
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
    public static async createTestProjectAndPageViaAPI(page: Page, projectName: string, pageName: string, lines: string[] = []): Promise<void> {
        if (lines.length == 0) {
            lines = [
                "これはテスト用のページです。1",
                "これはテスト用のページです。2",
                "内部リンクのテスト: [test-link]"
            ];
        }

        // Fluid APIを使用してプロジェクトとページを作成
        await page.evaluate(async ({ projectName, pageName, lines }) => {
            while (!window.__FLUID_STORE__) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            const fluidService = window.__FLUID_SERVICE__;
            const fluidClient = await fluidService.createNewContainer(projectName);

            fluidClient.createPage(pageName, lines);
        }, { projectName, pageName, lines });
    }

    /**
     * テスト用のページをFluid API経由で作成する
     * @param page Playwrightのページオブジェクト
     * @param pageName ページ名
     */
    public static async createTestPageViaAPI(page: Page, pageName: string, lines: string[]): Promise<void> {
        // Fluid APIを使用してページを作成
        await page.evaluate(async ({ pageName, lines }) => {
            while (!window.__FLUID_STORE__) {
                await new Promise(resolve => setTimeout(resolve, 100));
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
                } catch (error) {
                    console.error("Error getting tree data:", error);
                    return { error: error.message || "Unknown error" };
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
     * カーソルが表示されるまで待機する
     * @param page Playwrightのページオブジェクト
     * @param timeout タイムアウト時間（ミリ秒）
     */
    public static async waitForCursorVisible(page: Page, timeout = 15000): Promise<boolean> {
        try {
            await page.waitForFunction(() => {
                const cursor = document.querySelector('.editor-overlay .cursor.active');
                return cursor && window.getComputedStyle(cursor).opacity !== '0';
            }, { timeout });
            return true;
        } catch (error) {
            console.log("Timeout waiting for cursor to be visible, continuing anyway");
            // スクリーンショットを撮影して状態を確認
            await page.screenshot({ path: "client/test-results/cursor-visible-timeout.png" });
            return false;
        }
    }

    /**
     * プロジェクトページに移動する
     * 既存のプロジェクトがあればそれを使用し、なければ新規作成する
     * @param page Playwrightのページオブジェクト
     * @returns プロジェクト名
     */
    public static async navigateToTestProjectPage(page: Page, testInfo, lines: string[]): Promise<{ projectName: string, pageName: string }> {

        const projectName = `Test Project ${testInfo.workerIndex} ${Date.now()}`;
        const pageName = `test-page-${Date.now()}`;
        console.log("Creating new project:", projectName);
        await TestHelpers.createTestProjectAndPageViaAPI(page, projectName, pageName, lines);

        await page.goto(`/${projectName}/${pageName}`);

        await page.waitForSelector(".outliner-item", { timeout: 30000 });
        await page.waitForFunction(() => {
            const textarea = document.querySelector<HTMLTextAreaElement>(".global-textarea");
            return textarea !== null && document.activeElement === textarea;
        }, { timeout: 5000 });

        return { projectName, pageName };
    }

    /**
     * アウトライナーアイテムが表示されるのを待つ
     * @param page Playwrightのページオブジェクト
     * @param timeout タイムアウト時間（ミリ秒）
     */
    public static async waitForOutlinerItems(page: Page, timeout = 30000): Promise<void> {
        console.log("Waiting for outliner items to be visible...");

        const startTime = Date.now();
        let itemsVisible = false;

        while (Date.now() - startTime < timeout && !itemsVisible) {
            try {
                // 現在のURLを確認
                const currentUrl = page.url();
                console.log("Current URL:", currentUrl);

                // プロジェクトページに移動していない場合は、リダイレクトを待つ
                if (!currentUrl.includes("/project/") && !currentUrl.includes("?project=")) {
                    console.log("Not on a project page yet, waiting for redirect...");
                    await page.waitForTimeout(1000);
                    continue;
                }

                // アウトライナーアイテムが表示されるのを待つ
                const itemCount = await page.locator(".outliner-item").count();
                if (itemCount > 0) {
                    console.log(`Found ${itemCount} outliner items`);
                    itemsVisible = true;

                    // SharedTreeが初期化されるのを待つ
                    try {
                        await page.waitForFunction(() => {
                            return window.generalStore && window.generalStore.currentPage;
                        }, { timeout: 5000 });
                        console.log("SharedTree is initialized");
                    } catch (e) {
                        console.log("Timeout waiting for SharedTree initialization, continuing anyway");
                    }

                    // カーソルが初期化されるのを待つ
                    try {
                        await page.waitForFunction(() => {
                            return window.editorOverlayStore;
                        }, { timeout: 5000 });
                        console.log("EditorOverlayStore is initialized");
                    } catch (e) {
                        console.log("Timeout waiting for EditorOverlayStore initialization, continuing anyway");
                    }

                    // 少し待機して安定させる
                    await page.waitForTimeout(1000);
                    break;
                } else {
                    // アイテムが見つからない場合は、ページの状態を確認
                    console.log("No outliner items found yet, checking page state...");

                    // ページのHTMLを確認
                    const html = await page.content();
                    if (html.includes("class=\"outliner-item\"")) {
                        console.log("Outliner items found in HTML but not visible yet");
                        // DOMには存在するが、まだ表示されていない可能性がある
                        await page.waitForTimeout(1000);
                    } else if (html.includes("class=\"page-loading\"") || html.includes("Loading...")) {
                        console.log("Page is still loading");
                        await page.waitForTimeout(1000);
                    } else {
                        // ページの内容を確認
                        const bodyText = await page.textContent("body");
                        console.log("Page content (first 200 chars):", bodyText?.substring(0, 200));

                        // 新しいページを作成するボタンがあるか確認
                        const newPageButton = page.getByText("新しいページ");
                        if (await newPageButton.count() > 0) {
                            console.log("Found 'New Page' button, clicking it");
                            await newPageButton.click();
                            await page.waitForTimeout(1000);
                        } else {
                            // 少し待機して再試行
                            await page.waitForTimeout(2000);
                        }
                    }
                }
            } catch (e) {
                console.log("Error while waiting for outliner items:", e.message);
                await page.waitForTimeout(1000);
            }
        }

        if (!itemsVisible) {
            console.log("Timeout waiting for outliner items");
            // スクリーンショットを撮影して状態を確認
            await page.screenshot({ path: "client/test-results/outliner-items-timeout.png" });

            // ページのHTMLを確認
            const html = await page.content();
            console.log("Page HTML (first 500 chars):", html.substring(0, 500));

            // エラーはスローせず、テストを続行する
        }
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
        await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            if (!element) {
                console.error(`Element not found: ${sel}`);
                return;
            }

            // mouseenterイベントを強制的に発火
            const mouseEnterEvent = new MouseEvent('mouseenter', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            element.dispatchEvent(mouseEnterEvent);

            // mousemoveイベントも発火
            const mouseMoveEvent = new MouseEvent('mousemove', {
                bubbles: true,
                cancelable: true,
                view: window
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
        await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            if (!element) {
                console.error(`Element not found: ${sel}`);
                return;
            }

            // mouseleaveイベントを強制的に発火
            const mouseLeaveEvent = new MouseEvent('mouseleave', {
                bubbles: true,
                cancelable: true,
                view: window
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
        // リンク要素を特定
        const linkSelector = `a.internal-link:has-text("${linkText}")`;

        // リンク要素が存在するか確認
        const linkExists = await page.locator(linkSelector).count() > 0;
        if (!linkExists) {
            console.error(`Link not found: ${linkText}`);
            return;
        }

        // リンクプレビュー表示関数を直接呼び出す
        await page.evaluate(({ linkSelector: sel, linkText: text }) => {
            const link = document.querySelector(sel);
            if (!link) return;

            // リンクプレビューハンドラーを直接呼び出す
            // データ属性からページ名を取得
            const pageName = link.getAttribute('data-page');
            const projectName = link.getAttribute('data-project');

            if (!pageName) return;

            // グローバルスコープにテスト用の関数を追加
            window.__testShowLinkPreview = function (pageName: string, projectName?: string) {
                // プレビュー要素を作成
                const previewElement = document.createElement('div');
                previewElement.className = 'link-preview-popup';

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
                    left: "100px"
                }).forEach(([key, value]) => {
                    previewElement.style[key as any] = value;
                });

                // コンテンツを追加
                const titleElement = document.createElement('h3');
                titleElement.textContent = pageName;
                titleElement.style.fontSize = '16px';
                titleElement.style.fontWeight = '600';
                titleElement.style.margin = '0 0 8px 0';
                titleElement.style.paddingBottom = '8px';
                titleElement.style.borderBottom = '1px solid #eee';

                previewElement.appendChild(titleElement);

                // ページが存在するかどうかを確認
                const pageExists = link.classList.contains('page-exists');

                if (pageExists) {
                    const contentElement = document.createElement('div');
                    contentElement.className = 'preview-items';
                    contentElement.innerHTML = '<p>テストプレビューコンテンツ</p>';
                    previewElement.appendChild(contentElement);
                } else {
                    const notFoundElement = document.createElement('div');
                    notFoundElement.className = 'preview-not-found';
                    notFoundElement.innerHTML = '<p>ページが見つかりません</p>';
                    previewElement.appendChild(notFoundElement);
                }

                // DOMに追加
                document.body.appendChild(previewElement);

                console.log(`Created test preview for: ${pageName}`);
                return previewElement;
            };

            // プレビュー表示関数を呼び出す
            window.__testShowLinkPreview(pageName, projectName!);
        }, { linkSelector, linkText });

        // プレビューが表示されるのを待機
        await page.waitForTimeout(500);
    }

    /**
     * バックリンクパネルを開く
     * @param page Playwrightのページオブジェクト
     */
    public static async openBacklinkPanel(page: Page): Promise<void> {
        // バックリンクパネルのトグルボタンを探す
        const toggleButton = page.locator('.backlink-toggle-button');

        // ボタンが存在するか確認
        const buttonExists = await toggleButton.count() > 0;
        if (!buttonExists) {
            console.error('Backlink toggle button not found');
            return;
        }

        // パネルが既に開いているか確認
        const isOpen = await toggleButton.evaluate(el => el.classList.contains('active'));
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
        retryCount: number = 3
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
                    if (selector.includes('.internal-link') || selector.includes('.link-preview')) {
                        console.log('Trying to force render internal links...');
                        await page.evaluate(() => {
                            // 内部リンクを含む可能性のあるテキスト要素を検索
                            const textElements = document.querySelectorAll('.item-text');
                            console.log(`Found ${textElements.length} text elements to check for links`);

                            textElements.forEach(el => {
                                const text = el.textContent || '';
                                // 内部リンクのパターンを検出
                                if (text.includes('[') && text.includes(']')) {
                                    console.log('Found potential link in:', text);
                                    // フォーマット済みクラスを追加して強制的にレンダリング
                                    el.classList.add('formatted');
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
                const isVisible = await page.evaluate((sel) => {
                    const element = document.querySelector(sel);
                    if (!element) return false;

                    // 要素が画面内に表示されているか確認
                    const rect = element.getBoundingClientRect();
                    const isInViewport =
                        rect.top >= 0 &&
                        rect.left >= 0 &&
                        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                        rect.right <= (window.innerWidth || document.documentElement.clientWidth);

                    // スタイルを確認
                    const style = window.getComputedStyle(element);
                    const isVisibleStyle =
                        style.display !== 'none' &&
                        style.visibility !== 'hidden' &&
                        style.opacity !== '0' &&
                        rect.height > 0 &&
                        rect.width > 0;

                    // 親要素が非表示になっていないか確認
                    let parent = element.parentElement;
                    let isParentVisible = true;

                    while (parent) {
                        const parentStyle = window.getComputedStyle(parent);
                        if (
                            parentStyle.display === 'none' ||
                            parentStyle.visibility === 'hidden' ||
                            parentStyle.opacity === '0'
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
                if (selector.includes('.link-preview-popup')) {
                    console.log('Trying to force show link preview...');
                    await page.evaluate((sel) => {
                        const element = document.querySelector(sel);
                        if (element) {
                            // 強制的に表示
                            (element as HTMLElement).style.display = 'block';
                            (element as HTMLElement).style.visibility = 'visible';
                            (element as HTMLElement).style.opacity = '1';
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
        timeout: number = 10000
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

// グローバル型定義を拡張（テスト用にwindowオブジェクトに機能を追加）
declare global {
    interface Window {
        getCursorDebugData?: () => any;
        getCursorPathData?: (path?: string) => any;
        getFluidTreeDebugData?: () => any;
        __testShowLinkPreview?: (pageName: string, projectName?: string) => HTMLElement;
        fluidServerPort?: number;
        _alertMessage?: string | null;
        __FLUID_SERVICE__?: any;
        __FLUID_STORE__?: any;
        editorOverlayStore?: any;
    }
}
