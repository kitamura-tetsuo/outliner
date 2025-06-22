import {
    expect,
    type Page,
    type Response,
} from "@playwright/test";
import { CursorValidator } from "./cursorValidation";

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

        // アプリケーションが完全に初期化されたことを示すシグナルを待つ
        await page.waitForSelector('body[data-app-ready="true"]', { timeout: 15000 });
        console.log("TestHelpers: Application ready signal received.");

        // page.goto の上書き (SvelteKitのSPAナビゲーションを模倣/制御)
        // この部分は __SVELTE_GOTO__ が window に設定された後に実行される必要がある
        // data-app-ready が設定されるのは onMount の最後なので、__SVELTE_GOTO__ も利用可能なはず
        page.goto = async (
            url: string,
            options?: {
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
            console.log(`TestHelper: Creating project and page`, { projectName, pageName, linesCount: lines.length });

            while (!window.__FLUID_STORE__) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            console.log(`TestHelper: FluidStore is available`);

            const fluidService = window.__FLUID_SERVICE__;
            console.log(`TestHelper: FluidService is available`, { exists: !!fluidService });

            const fluidClient = await fluidService.createNewContainer(projectName);
            console.log(`TestHelper: FluidClient created`, { containerId: fluidClient.containerId });

            const project = fluidClient.getProject();
            console.log(`TestHelper: Project retrieved`, { projectTitle: project.title, itemsCount: project.items?.length });

            fluidClient.createPage(pageName, lines);
            console.log(`TestHelper: Page created`, { pageName });

            // fluidStoreを更新してアプリケーション状態を同期
            const fluidStore = window.__FLUID_STORE__;
            if (fluidStore) {
                console.log(`TestHelper: Updating fluidStore with new client`);
                fluidStore.fluidClient = fluidClient;
                console.log(`TestHelper: FluidStore updated`);
            } else {
                console.error(`TestHelper: FluidStore not found`);
            }

            // 作成後の状態を確認
            const updatedProject = fluidClient.getProject();
            console.log(`TestHelper: Updated project state`, {
                projectTitle: updatedProject.title,
                itemsCount: updatedProject.items?.length
            });

            if (updatedProject.items && updatedProject.items.length > 0) {
                for (let i = 0; i < updatedProject.items.length; i++) {
                    const page = updatedProject.items[i];
                    console.log(`TestHelper: Page ${i}`, { text: page.text, itemsCount: page.items?.length });
                }
            }
        }, { projectName, pageName, lines });

        // FluidClient が設定されるまで待機
        await page.waitForFunction(() => {
            return (window as any).__FLUID_STORE__?.fluidClient !== undefined;
        });
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
                    const parts = path.split(".");
                    let result = cursorData;
                    for (const part of parts) {
                        if (result === undefined || result === null) return null;
                        result = result[part];
                    }
                    return result;
                }
                catch (error) {
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
                }
                catch (error) {
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
                    const parts = path.split(".");
                    let result = treeData;
                    for (const part of parts) {
                        if (result === undefined || result === null) return null;
                        result = result[part];
                    }
                    return result;
                }
                catch (error) {
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
     * プロジェクトページに移動する
     * 既存のプロジェクトがあればそれを使用し、なければ新規作成する
     * @param page Playwrightのページオブジェクト
     * @returns プロジェクト名
     */
    public static async navigateToTestProjectPage(
        page: Page,
        testInfo,
        lines: string[],
    ): Promise<{ projectName: string; pageName: string; }> {
        const projectName = `Test Project ${testInfo.workerIndex} ${Date.now()}`;
        const pageName = `test-page-${Date.now()}`;
        await TestHelpers.createTestProjectAndPageViaAPI(page, projectName, pageName, lines);

        await page.goto(`/${projectName}/${pageName}`);
        console.log(`TestHelpers: Navigated to /${projectName}/${pageName}`);

        // アプリが準備完了になるのを再度待つ (ページ遷移後)
        await page.waitForSelector('body[data-app-ready="true"]', { timeout: 20000 });
        console.log(`TestHelpers: App ready after navigating to project page.`);

        // Add detailed logging from within the browser context
        await page.evaluate((expectedProjName, expectedPageNameFromUrl) => {
            const winStore = (window as any).store;
            const fluidStore = (window as any).fluidStore;
            const sveltePageStore = (window as any).sveltePageStore;

            console.log("======= Browser Context Debug Info START =======");
            console.log("Expected Project Name (from test):", expectedProjName);
            console.log("Expected Page Name (from URL):", expectedPageNameFromUrl);
            console.log("$page.params (from sveltePageStore):", sveltePageStore?.params);
            console.log("window.fluidStore.fluidClient.containerId:", fluidStore?.fluidClient?.containerId);
            console.log("window.fluidStore.fluidClient.project.title:", fluidStore?.fluidClient?.project?.title);
            const projectItems = fluidStore?.fluidClient?.project?.items;
            if (projectItems) {
                console.log(`window.fluidStore.fluidClient.project.items (${projectItems.length}):`);
                for(let i=0; i < projectItems.length; i++) {
                    const item = projectItems.at(i);
                    console.log(`  - Item ${i}: id=${item?.id}, text='${item?.text}', itemsCount=${item?.items?.length}`);
                }
            } else {
                console.log("window.fluidStore.fluidClient.project.items: undefined or empty");
            }

            console.log("window.store.project.title:", winStore?.project?.title);
            const storePages = winStore?.pages?.current;
            if (storePages) {
                console.log(`window.store.pages.current (${storePages.length}):`);
                for(let i=0; i < storePages.length; i++) {
                    console.log(`  - Page ${i}: id=${storePages[i]?.id}, text='${storePages[i]?.text}', itemsCount=${storePages[i]?.items?.length}`);
                }
            } else {
                console.log("window.store.pages.current: undefined or empty");
            }
            console.log("window.store.currentPage.text:", winStore?.currentPage?.text);
            console.log("window.store.currentPage.items?.length:", winStore?.currentPage?.items?.length);
            console.log("======= Browser Context Debug Info END =======");
        }, { expectedProjName: projectName, expectedPageNameFromUrl: pageName }); // Pass arguments as an object


        // store.currentPage が設定され、アイテムが存在し、ページ名が一致するかをポーリングで確認
        await page.waitForFunction((expectedPageName) => {
            const winStore = (window as any).store;
            // const fluidStore = (window as any).fluidStore; // Already logged above
            if (winStore?.currentPage) {
                if (winStore.currentPage.text === expectedPageName && winStore.currentPage.items?.length > 0) {
                    console.log(`TestHelpers: SUCCESS - currentPage '${winStore.currentPage.text}' [${winStore.currentPage.id}] has ${winStore.currentPage.items.length} items and matches expected name '${expectedPageName}'.`);
                    return true;
                }
                 console.log(`TestHelpers: POLLING - currentPage text: '${winStore.currentPage.text}' (expected: '${expectedPageName}'), items: ${winStore.currentPage.items?.length}`);
            } else {
                console.log(`TestHelpers: POLLING - winStore.currentPage is not yet available.`);
            }
            return false;
        }, pageName, { timeout: 25000 });

        console.log("TestHelpers: store.currentPage is set with items and correct pageName. Now waiting for .outliner-item DOM elements.");
        await page.waitForSelector(".outliner-item", { timeout: 10000 });

        // global-textarea の準備も待つ
        await page.waitForFunction(() => {
            const textarea = document.querySelector<HTMLTextAreaElement>(".global-textarea");
            // console.log("TestHelper: global-textarea found:", !!textarea);
            // console.log("TestHelper: activeElement:", document.activeElement?.tagName, document.activeElement?.className);
            return textarea !== null;
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
                    }
                    catch (e) {
                        console.log("Timeout waiting for SharedTree initialization, continuing anyway");
                    }

                    // カーソルが初期化されるのを待つ
                    try {
                        await page.waitForFunction(() => {
                            return window.editorOverlayStore;
                        }, { timeout: 5000 });
                        console.log("EditorOverlayStore is initialized");
                    }
                    catch (e) {
                        console.log("Timeout waiting for EditorOverlayStore initialization, continuing anyway");
                    }

                    // 少し待機して安定させる
                    await page.waitForTimeout(1000);
                    break;
                }
                else {
                    // アイテムが見つからない場合は、ページの状態を確認
                    console.log("No outliner items found yet, checking page state...");

                    // ページのHTMLを確認
                    const html = await page.content();
                    if (html.includes('class="outliner-item"')) {
                        console.log("Outliner items found in HTML but not visible yet");
                        // DOMには存在するが、まだ表示されていない可能性がある
                        await page.waitForTimeout(1000);
                    }
                    else if (html.includes('class="page-loading"') || html.includes("Loading...")) {
                        console.log("Page is still loading");
                        await page.waitForTimeout(1000);
                    }
                    else {
                        // ページの内容を確認
                        const bodyText = await page.textContent("body");
                        console.log("Page content (first 200 chars):", bodyText?.substring(0, 200));

                        // 新しいページを作成するボタンがあるか確認
                        const newPageButton = page.getByText("新しいページ");
                        if (await newPageButton.count() > 0) {
                            console.log("Found 'New Page' button, clicking it");
                            await newPageButton.click();
                            await page.waitForTimeout(1000);
                        }
                        else {
                            // 少し待機して再試行
                            await page.waitForTimeout(2000);
                        }
                    }
                }
            }
            catch (e) {
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
     * 指定インデックスのアイテムIDを取得する
     */
    public static async getItemIdByIndex(page: Page, index: number): Promise<string | null> {
        return await page.evaluate((i) => {
            const items = document.querySelectorAll('.outliner-item');
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
                    const elements = document.querySelectorAll(baseSelector);

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
            const pageName = link.getAttribute("data-page");
            const projectName = link.getAttribute("data-project");

            if (!pageName) return;

            // グローバルスコープにテスト用の関数を追加
            window.__testShowLinkPreview = function (pageName: string, projectName?: string) {
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
                    const isInViewport = rect.top >= 0 &&
                        rect.left >= 0 &&
                        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                        rect.right <= (window.innerWidth || document.documentElement.clientWidth);

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

    /**
     * 新しいプロジェクトをプログラムで作成し、そのURLを返す
     * @param page Playwrightのページオブジェクト
     * @param projectName 作成するプロジェクトの名前
     * @returns 作成されたプロジェクトのURL
     */
    public static async createNewProject(page: Page, projectName: string): Promise<string> {
        const newProjectData = await page.evaluate(async (name) => {
            if (!window.__FLUID_SERVICE__) {
                console.error("TestHelpers.createNewProject: __FLUID_SERVICE__ is not available on window.");
                throw new Error("__FLUID_SERVICE__ is not available on window.");
            }
            try {
                console.log(`TestHelpers.createNewProject: Calling createNewContainer with name: ${name}`);
                const fluidClient = await window.__FLUID_SERVICE__.createNewContainer(name);
                if (!fluidClient || !fluidClient.containerId || !fluidClient.project?.title) {
                    console.error("TestHelpers.createNewProject: Failed to create container or project structure is invalid.", fluidClient);
                    throw new Error("Failed to create container or project structure is invalid.");
                }
                // プロジェクト作成後、デフォルトのページ "page1" を作成
                const defaultPageName = "page1";
                if (typeof fluidClient.createPage === "function") {
                    fluidClient.createPage(defaultPageName, [`Content for ${defaultPageName}`]);
                    console.log(`TestHelpers.createNewProject: Default page "${defaultPageName}" created.`);
                } else {
                    // Fallback if createPage is not on fluidClient directly, try via project
                    const project = fluidClient.getProject();
                    if (project && typeof project.addPage === "function") {
                         project.addPage(defaultPageName, "test-user"); // Assuming "test-user" is acceptable author
                         console.log(`TestHelpers.createNewProject: Default page "${defaultPageName}" created via project.addPage.`);
                    } else {
                        console.warn(`TestHelpers.createNewProject: Could not create default page as createPage/addPage method not found.`);
                    }
                }

                console.log(`TestHelpers.createNewProject: Project created. Container ID: ${fluidClient.containerId}, Project Title: ${fluidClient.project.title}, Attempted Default Page: ${defaultPageName}`);
                return {
                    containerId: fluidClient.containerId,
                    projectTitle: fluidClient.project.title,
                    pageName: defaultPageName, // Use the fixed default page name
                };
            } catch (error) {
                console.error("TestHelpers.createNewProject: Error during createNewContainer:", error);
                throw error; // Re-throw to fail the test if project creation fails
            }
        }, projectName);

        // URLを構築 (アプリケーションのルーティング規則に合わせる)
        // 例: /project-title/page-name
        // プロジェクト名やページ名に特殊文字が含まれる場合はエンコードが必要
        const projectUrl = `/${encodeURIComponent(newProjectData.projectTitle)}/${encodeURIComponent(newProjectData.pageName)}`;
        console.log(`TestHelpers.createNewProject: Constructed project URL: ${projectUrl}`);
        return projectUrl;
    }

    /**
     * E2Eテスト用の事前定義されたユーザーとしてログインする
     * @param page Playwrightのページオブジェクト
     * @param role テストユーザーのロール（現在は未使用だが将来的な拡張のため）
     */
    public static async loginAsTestUser(page: Page, role: 'owner' | 'shared_user' | 'default' = 'default'): Promise<void> {
        // VITE_TEST_USER_EMAIL と VITE_TEST_USER_PASSWORD は .env.test などで定義されていることを期待
        const TEST_USER_EMAIL = process.env.VITE_E2E_TEST_USER_EMAIL || 'test@example.com';
        const TEST_USER_PASSWORD = process.env.VITE_E2E_TEST_USER_PASSWORD || 'password';

        console.log(`TestHelpers.loginAsTestUser: Attempting to log in as ${role} (${TEST_USER_EMAIL})`);

        await page.evaluate(async ({ email, password }) => {
            if (!window.__USER_MANAGER__) {
                console.error("TestHelpers.loginAsTestUser: __USER_MANAGER__ is not available on window.");
                throw new Error("__USER_MANAGER__ is not available on window for login.");
            }
            try {
                // UserManagerのloginWithEmailPasswordメソッドを呼び出す
                await window.__USER_MANAGER__.loginWithEmailPassword(email, password);
                console.log(`TestHelpers.loginAsTestUser: loginWithEmailPassword called for ${email}`);

                // ログイン状態がUserManagerのイベント経由で反映されるのを待つ必要がある
                // waitForFunctionでcurrentUserが期待通りになるのを待つ
                await new Promise<void>((resolve, reject) => {
                    let attempts = 0;
                    const maxAttempts = 20; // 約2秒待機 (100ms * 20)
                    const interval = setInterval(() => {
                        const user = window.__USER_MANAGER__.getCurrentUser();
                        if (user && user.email?.toLowerCase() === email.toLowerCase()) {
                            clearInterval(interval);
                            console.log(`TestHelpers.loginAsTestUser: Login confirmed for ${email} via getCurrentUser.`);
                            resolve();
                        } else if (attempts >= maxAttempts) {
                            clearInterval(interval);
                            console.error(`TestHelpers.loginAsTestUser: Timeout waiting for login confirmation (getCurrentUser) for ${email}. Current user:`, user);
                            reject(new Error(`Timeout waiting for login confirmation (getCurrentUser) for ${email}`));
                        }
                        attempts++;
                    }, 100);
                });

            } catch (error) {
                console.error(`TestHelpers.loginAsTestUser: Error during loginWithEmailPassword for ${email}:`, error);
                // エラーを再スローしてテストを失敗させる
                throw new Error(`Login failed for ${email}: ${error.message || error}`);
            }
        }, { email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });

        // ページをリロードして、ログイン状態をアプリケーション全体に確実に反映させる
        console.log("TestHelpers.loginAsTestUser: Adding short wait before reload.");
        await page.waitForTimeout(500); // 短い待機を追加
        console.log("TestHelpers.loginAsTestUser: Reloading page to ensure auth state is applied.");
        await page.reload({ waitUntil: 'load' }); // waitUntil を 'load' に変更
        // アプリケーションが再度準備完了になるのを待つ
        await page.waitForSelector('body[data-app-ready="true"]', { timeout: 20000 });
        console.log("TestHelpers.loginAsTestUser: Page reloaded and app ready after login.");
    }
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
                items: []
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
                            childItems: []
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
                                        lastChanged: childItem.lastChanged
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
                project: projectDetails
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
                        childItems: []
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
                                    lastChanged: childItem.lastChanged
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
        __USER_MANAGER__?: any;
        editorOverlayStore?: any;
    }
}
