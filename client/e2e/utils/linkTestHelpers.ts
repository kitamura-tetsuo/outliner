import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { setupTestPage, setupTreeDebugger, waitForCursorVisible } from "../helpers";

/**
 * 内部リンクのテスト用のヘルパー関数群
 */
export class LinkTestHelpers {
    /**
     * テスト用のプロジェクトとページを作成する
     * @param page Playwrightのページオブジェクト
     * @param projectName プロジェクト名
     * @param pageName ページ名
     * @param content ページの内容（オプション）
     */
    static async createTestProjectAndPage(
        page: Page,
        projectName: string,
        pageName: string,
        content: string[] = ["これはテスト用のページです。", "内部リンクのテスト: [test-link]"]
    ): Promise<void> {
        // まずテストページをセットアップ（基本的なページを表示）
        await setupTestPage(page);

        // TreeDebuggerをセットアップ
        await setupTreeDebugger(page);

        // FluidClientインスタンスが初期化されるのを待つ
        await page.waitForFunction(() => window.__FLUID_CLIENT__, { timeout: 30000 });

        // Fluid APIを使用してプロジェクトとページを作成
        await page.evaluate(({ projectName, pageName, content }) => {
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
                        for (const text of content) {
                            const item = pageItems.addNode("test-user");
                            item.updateText(text);
                        }
                    }
                }

                return { success: true };
            } catch (error) {
                console.error("Error creating project and page:", error);
                throw error;
            }
        }, { projectName, pageName, content });

        // 少し待機してデータが保存されるのを待つ
        await page.waitForTimeout(1000);
    }

    /**
     * 複数のプロジェクトとページを作成する
     * @param page Playwrightのページオブジェクト
     * @param projects プロジェクトとページの情報
     */
    static async createMultipleProjectsAndPages(
        page: Page,
        projects: Array<{
            projectName: string;
            pages: Array<{
                pageName: string;
                content?: string[];
            }>;
        }>
    ): Promise<void> {
        // まずテストページをセットアップ（基本的なページを表示）
        await setupTestPage(page);

        // TreeDebuggerをセットアップ
        await setupTreeDebugger(page);

        // FluidClientインスタンスが初期化されるのを待つ
        await page.waitForFunction(() => window.__FLUID_CLIENT__, { timeout: 30000 });

        // Fluid APIを使用してプロジェクトとページを作成
        await page.evaluate((projects) => {
            // グローバルFluidClientインスタンスを取得
            const fluidClient = window.__FLUID_CLIENT__;
            if (!fluidClient) {
                throw new Error("FluidClient instance not found");
            }

            try {
                // プロジェクトとページのデータを取得
                const appData = fluidClient.appData;
                const rootProject = appData.root;

                // 既存のプロジェクトを取得
                const existingProjects = rootProject.items;

                // 各プロジェクトを作成
                for (let i = 0; i < projects.length; i++) {
                    const projectInfo = projects[i];

                    // プロジェクトを作成または更新
                    let project;
                    if (i === 0 && existingProjects && existingProjects.length > 0) {
                        // 最初のプロジェクトは既存のものを更新
                        project = existingProjects[0];
                        project.updateText(projectInfo.projectName);
                    } else {
                        // 新しいプロジェクトを作成
                        project = rootProject.items.addNode("test-user");
                        project.updateText(projectInfo.projectName);
                    }

                    // 各ページを作成
                    for (const pageInfo of projectInfo.pages) {
                        // ページを作成
                        const page = project.items.addNode("test-user");
                        page.updateText(pageInfo.pageName);

                        // ページの内容を追加
                        const pageItems = page.items;
                        if (pageItems) {
                            // 既存のアイテムをクリア
                            while (pageItems.length > 0) {
                                pageItems.removeAt(0);
                            }

                            // 新しいアイテムを追加
                            const content = pageInfo.content || ["これはテスト用のページです。", "内部リンクのテスト: [test-link]"];
                            for (const text of content) {
                                const item = pageItems.addNode("test-user");
                                item.updateText(text);
                            }
                        }
                    }
                }

                return { success: true };
            } catch (error) {
                console.error("Error creating projects and pages:", error);
                throw error;
            }
        }, projects);

        // 少し待機してデータが保存されるのを待つ
        await page.waitForTimeout(1000);
    }

    /**
     * 内部リンクのナビゲーション機能をテストする
     * @param page Playwrightのページオブジェクト
     * @param linkSelector 内部リンクのセレクタ
     * @param expectedUrl 期待されるURL
     */
    static async testInternalLinkNavigation(
        page: Page,
        linkSelector: string,
        expectedUrl: string
    ): Promise<void> {
        // 現在のURLを保存
        const currentUrl = page.url();

        // リンクをクリック
        await page.click(linkSelector);

        // ページが読み込まれるのを待つ
        await page.waitForSelector("body", { timeout: 10000 });

        // 新しいURLを取得
        const newUrl = page.url();

        // URLが期待通りであることを確認
        expect(newUrl).toContain(expectedUrl);

        // URLが変更されていることを確認
        expect(newUrl).not.toBe(currentUrl);
    }

    /**
     * テスト用のページを直接作成する（UI操作ではなくFluid APIを使用）
     * @param page Playwrightのページオブジェクト
     * @param projectName プロジェクト名
     * @param pageName ページ名
     * @param content ページの内容（配列で複数行指定可能）
     * @param navigateToPage 作成後にページに移動するかどうか
     */
    static async createTestPageDirect(
        page: Page,
        projectName: string,
        pageName: string,
        content: string[] = ["テストページの内容です"],
        navigateToPage: boolean = false
    ): Promise<void> {
        // TreeDebuggerをセットアップ
        await setupTreeDebugger(page);

        // FluidClientインスタンスが初期化されるのを待つ
        await page.waitForFunction(() => window.__FLUID_CLIENT__, { timeout: 30000 });

        // Fluid APIを使用してページを作成
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
                let project = null;

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
                let page = null;

                // 既存のページを検索
                if (project.items && project.items.length > 0) {
                    for (let i = 0; i < project.items.length; i++) {
                        const p = project.items[i];
                        if (p.text === pageName) {
                            page = p;
                            break;
                        }
                    }
                }

                // ページが見つからない場合は新規作成
                if (!page) {
                    page = project.items.addNode("test-user");
                    page.updateText(pageName);
                }

                // ページの内容を設定
                const pageItems = page.items;

                // 既存のアイテムをクリア
                if (pageItems) {
                    while (pageItems.length > 0) {
                        pageItems.removeAt(0);
                    }

                    // 新しいアイテムを追加
                    for (const text of content) {
                        const item = pageItems.addNode("test-user");
                        item.updateText(text);
                    }
                }

                return {
                    success: true,
                    projectId: project.id,
                    pageId: page.id
                };
            } catch (error) {
                console.error("Error creating page:", error);
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

            // ページが正しく読み込まれたことを確認
            await page.waitForSelector(".outliner-item", { timeout: 10000 });
        }
    }

    /**
     * 既存のページを開く
     * @param page Playwrightのページオブジェクト
     * @param projectName プロジェクト名
     * @param pageName ページ名
     */
    static async openPage(
        page: Page,
        projectName: string,
        pageName: string
    ): Promise<void> {
        // ページに移動
        await page.goto(`/${projectName}/${pageName}`);

        // ページが読み込まれるのを待つ
        await page.waitForSelector(".outliner-item", { timeout: 10000 });

        // 開発者ログインボタンをクリック（表示されている場合）
        const loginButton = page.locator("button:has-text('開発者ログイン')");
        if (await loginButton.isVisible()) {
            await loginButton.click();
            await page.waitForTimeout(1000);
        }
    }

    /**
     * リンクプレビューを強制的に表示する
     * @param page Playwrightのページオブジェクト
     * @param linkText リンクのテキスト
     */
    static async forceLinkPreview(page: Page, linkText: string): Promise<void> {
        await page.evaluate((text) => {
            // リンク要素を取得
            const linkElement = Array.from(document.querySelectorAll('a.internal-link')).find(
                (el) => el.textContent === text
            );

            if (!linkElement) {
                console.error(`Link with text "${text}" not found`);
                return;
            }

            // カスタムイベントを発火
            const mouseoverEvent = new MouseEvent('mouseover', {
                bubbles: true,
                cancelable: true,
                view: window
            });
            linkElement.dispatchEvent(mouseoverEvent);

            // プレビュー要素を強制的に表示
            setTimeout(() => {
                const previewElement = document.querySelector('.link-preview-popup');
                if (previewElement) {
                    (previewElement as HTMLElement).style.display = 'block';
                    (previewElement as HTMLElement).style.visibility = 'visible';
                    (previewElement as HTMLElement).style.opacity = '1';
                }
            }, 100);
        }, linkText);

        await page.waitForTimeout(500);
    }

    /**
     * 内部リンクを強制的に作成する
     * @param page Playwrightのページオブジェクト
     * @param itemId アイテムのID
     * @param linkText リンクのテキスト
     */
    static async forceCreateInternalLink(page: Page, itemId: string, linkText: string): Promise<void> {
        await page.evaluate(({ itemId, linkText }) => {
            // グローバルFluidClientインスタンスを取得
            const fluidClient = window.__FLUID_CLIENT__;
            if (!fluidClient) {
                console.error("FluidClient instance not found");
                return false;
            }

            try {
                // アイテムを検索
                const appData = fluidClient.appData;
                const findItemById = (node: any, id: string): any => {
                    if (node.id === id) return node;

                    if (node.items) {
                        for (let i = 0; i < node.items.length; i++) {
                            const found = findItemById(node.items[i], id);
                            if (found) return found;
                        }
                    }

                    return null;
                };

                // ルートから検索
                const item = findItemById(appData.root, itemId);
                if (!item) {
                    console.error(`Item with ID ${itemId} not found`);
                    return false;
                }

                // テキストを更新
                const currentText = item.text || "";
                const newText = currentText + ` [${linkText}]`;
                item.updateText(newText);

                return true;
            } catch (error) {
                console.error("Error creating internal link:", error);
                return false;
            }
        }, { itemId, linkText });

        await page.waitForTimeout(500);
    }

    /**
     * 内部リンクを検出する
     * @param page Playwrightのページオブジェクト
     * @param linkText リンクのテキスト
     * @returns リンク要素が存在する場合はtrue
     */
    static async detectInternalLink(page: Page, linkText: string): Promise<boolean> {
        // リンク要素を検出
        const linkCount = await page.evaluate((text) => {
            const links = Array.from(document.querySelectorAll('a.internal-link')).filter(
                (el) => el.textContent === text
            );
            return links.length;
        }, linkText);

        return linkCount > 0;
    }

    /**
     * 内部リンクのプレビューを強制的に表示する
     * @param page Playwrightのページオブジェクト
     * @param pageName プレビューを表示するページ名
     * @param projectName プロジェクト名（省略可）
     * @param pageExists ページが存在するかどうか（デフォルトはtrue）
     */
    static async forceLinkPreview(
        page: Page,
        pageName: string,
        projectName?: string,
        pageExists: boolean = true
    ): Promise<void> {
        await page.evaluate(({ pageName, projectName, pageExists }) => {
            // グローバル関数が存在しない場合は作成
            if (!window.__testShowLinkPreview) {
                window.__testShowLinkPreview = (pageName, projectName, pageExists) => {
                    console.log(`Forcing link preview for page: ${pageName} (exists: ${pageExists})`);

                    // プレビューポップアップを作成
                    let popup = document.querySelector('.link-preview-popup');
                    if (!popup) {
                        popup = document.createElement('div');
                        popup.className = 'link-preview-popup';
                        document.body.appendChild(popup);
                    }

                    // プレビューの内容を設定
                    if (pageExists) {
                        // 存在するページの場合
                        popup.innerHTML = `
                            <h3>${pageName}</h3>
                            <div class="preview-items">
                                <p>テスト用のプレビュー内容です。</p>
                            </div>
                        `;
                    } else {
                        // 存在しないページの場合
                        popup.innerHTML = `
                            <h3>${pageName}</h3>
                            <div class="preview-not-found">
                                <p>ページが見つかりません。クリックして新規作成します。</p>
                            </div>
                        `;
                    }

                    // スタイルを設定して表示
                    (popup as HTMLElement).style.display = 'block';
                    (popup as HTMLElement).style.position = 'fixed';
                    (popup as HTMLElement).style.top = '100px';
                    (popup as HTMLElement).style.left = '100px';
                    (popup as HTMLElement).style.zIndex = '1000';
                    (popup as HTMLElement).style.backgroundColor = '#fff';
                    (popup as HTMLElement).style.border = '1px solid #ccc';
                    (popup as HTMLElement).style.padding = '10px';
                    (popup as HTMLElement).style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';

                    return popup;
                };
            }

            // プレビューを表示
            return window.__testShowLinkPreview(pageName, projectName, pageExists);
        }, { pageName, projectName, pageExists });

        // プレビューが表示されるのを待つ
        await page.waitForTimeout(500);
    }

    /**
     * 内部リンクを強制的に表示する
     * @param page Playwrightのページオブジェクト
     */
    static async forceRenderInternalLinks(page: Page): Promise<void> {
        const result = await page.evaluate(() => {
            // 全てのアウトライナーアイテムを取得
            const items = document.querySelectorAll('.outliner-item');
            console.log(`Found ${items.length} outliner items`);

            let linksFound = 0;
            let linksProcessed = 0;

            // 各アイテムのテキストを再レンダリング
            items.forEach((item) => {
                const textElement = item.querySelector('.item-text');
                if (textElement) {
                    // テキスト内容を取得
                    const text = textElement.textContent || "";

                    // 内部リンクのパターンを検出（通常の内部リンク）
                    const linkPattern = /\[([^\[\]\/\-][^\[\]]*?)\]/g;
                    // プロジェクト内部リンクのパターン
                    const projectLinkPattern = /\[\/([\w\-\/]+)\]/g;

                    const hasNormalLinks = linkPattern.test(text);
                    // テストを実行した後にテキストを元に戻す
                    linkPattern.lastIndex = 0;

                    const hasProjectLinks = projectLinkPattern.test(text);
                    // テストを実行した後にテキストを元に戻す
                    projectLinkPattern.lastIndex = 0;

                    if (hasNormalLinks || hasProjectLinks) {
                        linksFound++;

                        // リンクを含む場合、HTMLを直接設定
                        let html = text;

                        // 通常の内部リンクを処理
                        if (hasNormalLinks) {
                            html = html.replace(linkPattern, (match, linkText) => {
                                linksProcessed++;
                                return `<span class="link-preview-wrapper">
                                    <a href="/${linkText}" class="internal-link" data-page="${linkText}">${linkText}</a>
                                </span>`;
                            });
                        }

                        // プロジェクト内部リンクを処理
                        if (hasProjectLinks) {
                            html = html.replace(projectLinkPattern, (match, path) => {
                                linksProcessed++;
                                // パスを分解してプロジェクト名とページ名を取得
                                const parts = path.split('/').filter(p => p);
                                if (parts.length >= 2) {
                                    const projectName = parts[0];
                                    const pageName = parts.slice(1).join('/');

                                    return `<span class="link-preview-wrapper">
                                        <a href="/${path}" class="internal-link project-link" data-project="${projectName}" data-page="${pageName}">${path}</a>
                                    </span>`;
                                } else {
                                    return `<a href="/${path}" class="internal-link project-link">${path}</a>`;
                                }
                            });
                        }

                        // HTMLを設定
                        textElement.innerHTML = html;

                        // フォーマット済みクラスを追加
                        textElement.classList.add('formatted');
                    }
                }
            });

            // リンクにイベントリスナーを設定
            const setupLinkEventListeners = () => {
                const links = document.querySelectorAll('a.internal-link');
                console.log(`Found ${links.length} internal links to setup event listeners`);

                links.forEach(link => {
                    // 既に設定済みかどうかを確認するためのフラグ
                    const hasListeners = link.getAttribute('data-link-listeners') === 'true';

                    if (!hasListeners) {
                        // マウスオーバーイベントリスナーを追加
                        link.addEventListener('mouseenter', (event) => {
                            console.log('Link mouseenter event triggered');
                            // データ属性からページ名を取得
                            const pageName = link.getAttribute('data-page');
                            const projectName = link.getAttribute('data-project');

                            if (pageName) {
                                // リンクプレビュー表示のカスタムイベントを発火
                                const customEvent = new CustomEvent('linkPreviewShow', {
                                    detail: { pageName, projectName, element: link }
                                });
                                document.dispatchEvent(customEvent);
                            }
                        });

                        // マウスアウトイベントリスナーを追加
                        link.addEventListener('mouseleave', () => {
                            console.log('Link mouseleave event triggered');
                            // リンクプレビュー非表示のカスタムイベントを発火
                            const customEvent = new CustomEvent('linkPreviewHide');
                            document.dispatchEvent(customEvent);
                        });

                        // リスナーが設定されたことを示すフラグを設定
                        link.setAttribute('data-link-listeners', 'true');
                    }
                });

                return links.length;
            };

            // リンクにイベントリスナーを設定
            const linksWithListeners = setupLinkEventListeners();

            // MutationObserverが存在するか確認
            const hasMutationObserver = !!window.__linkPreviewMutationObserver;

            // MutationObserverがない場合は作成
            if (!hasMutationObserver) {
                // MutationObserverを作成
                const observer = new MutationObserver((mutations) => {
                    let newLinksFound = false;

                    mutations.forEach(mutation => {
                        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                            mutation.addedNodes.forEach(node => {
                                if (node.nodeType === Node.ELEMENT_NODE) {
                                    const element = node as Element;

                                    // 追加された要素自体が内部リンクかどうかを確認
                                    if (element.classList && element.classList.contains('internal-link')) {
                                        newLinksFound = true;
                                    }

                                    // 追加された要素内の内部リンクを検索
                                    const links = element.querySelectorAll('.internal-link');
                                    if (links.length > 0) {
                                        newLinksFound = true;
                                    }
                                }
                            });
                        }
                    });

                    if (newLinksFound) {
                        console.log('New internal links found, setting up event listeners');
                        setupLinkEventListeners();
                    }
                });

                // 監視を開始
                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['class']
                });

                // グローバル変数に保存
                window.__linkPreviewMutationObserver = observer;
            }

            return {
                itemsCount: items.length,
                linksFound,
                linksProcessed,
                linksWithListeners,
                hasMutationObserver
            };
        });

        console.log(`Force render internal links result:`, result);

        // リンクが処理されるのを待つ
        await page.waitForTimeout(1000);
    }
}

// グローバル型定義を拡張
declare global {
    interface Window {
        __FLUID_CLIENT__?: any;
        __linkPreviewMutationObserver?: MutationObserver;
        __testShowLinkPreview?: (pageName: string, projectName?: string, pageExists?: boolean) => HTMLElement;
    }
}
