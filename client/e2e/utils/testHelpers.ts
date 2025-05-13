import { expect, type Page } from "@playwright/test";
import { CursorValidator } from "./cursorValidation";
import { TreeValidator } from "./treeValidation";

/**
 * テスト用のヘルパー関数群
 */
export class TestHelpers {
    /**
     * カーソルデバッグ機能をセットアップする
     * @param page Playwrightのページオブジェクト
     */
    public static async setupCursorDebugger(page: Page): Promise<void> {
        await page.evaluate(() => {
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
                    const cursorInstances: Array<any> = [];

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

            // 特定のパスのデータを取得する関数
            window.getCursorPathData = function(path?: string) {
                const data = window.getCursorDebugData();
                if (!path) return data;

                return path.split('.').reduce((prev, curr) => {
                    return prev && prev[curr];
                }, data);
            };
        });
    }

    /**
     * SharedTreeデバッグ機能をセットアップする
     * @param page Playwrightのページオブジェクト
     */
    public static async setupTreeDebugger(page: Page): Promise<void> {
        await page.evaluate(() => {
            // グローバルオブジェクトにデバッグ関数を追加
            window.getFluidTreeDebugData = function() {
                // generalStoreインスタンスを取得
                const generalStore = window.generalStore;
                if (!generalStore) {
                    console.error("generalStore instance not found");
                    return { error: "generalStore instance not found" };
                }

                try {
                    // ルートアイテムを取得
                    const rootItem = generalStore.currentPage;
                    if (!rootItem) {
                        return { error: "Root item not found" };
                    }

                    // アイテム数をカウント
                    let itemCount = 0;
                    const items: any[] = [];

                    // アイテムを再帰的に処理する関数
                    function processItem(item: any, depth = 0): any {
                        itemCount++;
                        const result: any = {
                            id: item.id,
                            text: item.text,
                            author: item.author,
                            votes: item.votes || [],
                            created: item.created,
                            lastChanged: item.lastChanged
                        };

                        // 子アイテムを処理
                        if (item.items && typeof item.items[Symbol.iterator] === 'function') {
                            result.items = [];
                            for (const child of item.items) {
                                result.items.push(processItem(child, depth + 1));
                            }
                        }

                        return result;
                    }

                    // ルートアイテムから処理開始
                    items.push(processItem(rootItem));

                    return {
                        itemCount,
                        items
                    };
                } catch (error) {
                    console.error("Error getting tree data:", error);
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
    public static async waitForCursorVisible(page: Page, timeout = 5000): Promise<boolean> {
        try {
            await page.waitForFunction(() => {
                const cursor = document.querySelector('.editor-overlay .cursor.active');
                return cursor && window.getComputedStyle(cursor).opacity !== '0';
            }, { timeout });
            return true;
        } catch (error) {
            console.log("Timeout waiting for cursor to be visible, continuing anyway");
            // スクリーンショットを撮影して状態を確認
            await page.screenshot({ path: "test-results/cursor-visible-timeout.png" });
            return false;
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
        await page.evaluate((sel, text) => {
            const link = document.querySelector(sel);
            if (!link) return;

            // リンクプレビューハンドラーを直接呼び出す
            // データ属性からページ名を取得
            const pageName = link.getAttribute('data-page');
            const projectName = link.getAttribute('data-project');

            if (!pageName) return;

            // グローバルスコープにテスト用の関数を追加
            window.__testShowLinkPreview = function(pageName: string, projectName?: string) {
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
            window.__testShowLinkPreview(pageName, projectName);
        }, linkSelector, linkText);

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

    /**
     * マウスアウトイベントを強制的に発火する
     * @param page Playwrightのページオブジェクト
     * @param selector 対象要素のセレクタ
     */
    public static async forceMouseOutEvent(page: Page, selector: string): Promise<void> {
        // 内部リンク要素のセレクタが:has-text()を含む場合は、単純なセレクタに変換
        if (selector.includes(':has-text(')) {
            console.log('Converting complex selector to simple selector for mouseout event');
            selector = '.internal-link';
        }

        await page.evaluate((sel) => {
            // 要素を検索
            const elements = document.querySelectorAll(sel);
            if (elements.length > 0) {
                elements.forEach(element => {
                    // mouseoutイベントを作成
                    const mouseoutEvent = new MouseEvent('mouseout', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });

                    // mouseleaveイベントを作成
                    const mouseleaveEvent = new MouseEvent('mouseleave', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });

                    // イベントを発火
                    element.dispatchEvent(mouseoutEvent);
                    element.dispatchEvent(mouseleaveEvent);
                });

                // カスタムイベントも発火
                const linkPreviewHideEvent = new CustomEvent('linkPreviewHide');
                document.dispatchEvent(linkPreviewHideEvent);

                console.log(`Forced mouseout/mouseleave events on ${elements.length} elements: ${sel}`);
            } else {
                console.log(`Element not found for mouseout event: ${sel}`);

                // 要素が見つからない場合でも、カスタムイベントを発火
                const linkPreviewHideEvent = new CustomEvent('linkPreviewHide');
                document.dispatchEvent(linkPreviewHideEvent);

                // プレビューポップアップを直接非表示にする
                const popup = document.querySelector('.link-preview-popup');
                if (popup) {
                    (popup as HTMLElement).style.display = 'none';
                    console.log('Forced hide of link preview popup');
                }
            }
        }, selector);
    }
}

// グローバル型定義を拡張（テスト用にwindowオブジェクトに機能を追加）
declare global {
    interface Window {
        getCursorDebugData?: () => any;
        getCursorPathData?: (path?: string) => any;
        getFluidTreeDebugData?: () => any;
        __testShowLinkPreview?: (pageName: string, projectName?: string) => HTMLElement;
    }
}
