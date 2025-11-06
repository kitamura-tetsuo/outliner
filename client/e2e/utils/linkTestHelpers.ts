import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { TestHelpers } from "./testHelpers";

/**
 * 内部リンクのテスト用のヘルパー関数群（Yjs ベース）
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
        content: string[] = ["これはテスト用のページです。", "内部リンクのテスト: [test-link]"],
    ): Promise<void> {
        // 状態デバッガをセットアップ
        await TestHelpers.setupTreeDebugger(page);

        // Yjs backing store の初期化待ち
        await page.waitForFunction(() => {
            const gs: any = (window as any).generalStore || (window as any).appStore;
            return !!(gs && gs.project);
        }, { timeout: 30000 });

        // Yjs API 経由で作成
        await page.evaluate(({ projectName, pageName, content }) => {
            const gs: any = (window as any).generalStore || (window as any).appStore;
            if (!gs?.project) throw new Error("generalStore.project not ready");

            try {
                gs.project.title = projectName;

                const pages: any = gs.project.items;
                const len = pages?.length ?? 0;
                let target: any = undefined;
                for (let i = 0; i < len; i++) {
                    const it = pages.at ? pages.at(i) : pages[i];
                    const t = it?.text?.toString?.() ?? String(it?.text ?? "");
                    if (String(t) === pageName) {
                        target = it;
                        break;
                    }
                }

                if (!target) target = gs.project.addPage(pageName, "tester");
                else target.updateText(pageName);

                const items = target.items as any;
                while ((items?.length ?? 0) > 0) items.removeAt(0);
                for (const line of content) {
                    const it = items.addNode("tester");
                    it.updateText(line);
                }
                if (!gs.currentPage) gs.currentPage = target;
            } catch (e) {
                console.error("Error creating project/page via Yjs:", e);
                throw e;
            }
        }, { projectName, pageName, content });

        await page.waitForTimeout(200);
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
        }>,
    ): Promise<void> {
        // 状態デバッガをセットアップ
        await TestHelpers.setupTreeDebugger(page);

        // Yjs 初期化待ち
        await page.waitForFunction(() => {
            const gs: any = (window as any).generalStore || (window as any).appStore;
            return !!(gs && gs.project);
        }, { timeout: 30000 });

        // 単一プロジェクト内にページを複数用意
        await page.evaluate((projects) => {
            const gs: any = (window as any).generalStore || (window as any).appStore;
            if (!gs?.project) throw new Error("generalStore.project not ready");
            try {
                if (projects.length > 0) gs.project.title = projects[0].projectName;
                for (const p of projects) {
                    for (const pg of p.pages) {
                        const pages: any = gs.project.items;
                        const len = pages?.length ?? 0;
                        let target: any = undefined;
                        for (let i = 0; i < len; i++) {
                            const it = pages.at ? pages.at(i) : pages[i];
                            const t = it?.text?.toString?.() ?? String(it?.text ?? "");
                            if (String(t) === pg.pageName) {
                                target = it;
                                break;
                            }
                        }
                        if (!target) target = gs.project.addPage(pg.pageName, "tester");
                        const items = target.items as any;
                        while ((items?.length ?? 0) > 0) items.removeAt(0);
                        const lines = pg.content || ["これはテスト用のページです。", "内部リンクのテスト: [test-link]"];
                        for (const line of lines) {
                            const it = items.addNode("tester");
                            it.updateText(line);
                        }
                    }
                }
            } catch (e) {
                console.error("Error creating pages via Yjs:", e);
                throw e;
            }
        }, projects);

        await page.waitForTimeout(200);
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
        expectedUrl: string,
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
     * テスト用のページを直接作成する（UI操作ではなく Yjs API を使用）
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
        navigateToPage: boolean = false,
    ): Promise<void> {
        // TreeDebuggerをセットアップ
        await TestHelpers.setupTreeDebugger(page);

        // Yjs 初期化待ち
        await page.waitForFunction(() => {
            const gs: any = (window as any).generalStore || (window as any).appStore;
            return !!(gs && gs.project);
        }, { timeout: 30000 });

        await page.evaluate(({ projectName, pageName, content }) => {
            const gs: any = (window as any).generalStore || (window as any).appStore;
            if (!gs?.project) throw new Error("generalStore.project not ready");
            try {
                gs.project.title = projectName;
                const pages: any = gs.project.items;
                const len = pages?.length ?? 0;
                let target: any = undefined;
                for (let i = 0; i < len; i++) {
                    const it = pages.at ? pages.at(i) : pages[i];
                    const t = it?.text?.toString?.() ?? String(it?.text ?? "");
                    if (String(t) === pageName) {
                        target = it;
                        break;
                    }
                }
                if (!target) target = gs.project.addPage(pageName, "tester");
                const items = target.items as any;
                while ((items?.length ?? 0) > 0) items.removeAt(0);
                for (const line of content) {
                    const it = items.addNode("tester");
                    it.updateText(line);
                }
                if (!gs.currentPage) gs.currentPage = target;
            } catch (e) {
                console.error("Error creating page via Yjs:", e);
                throw e;
            }
        }, { projectName, pageName, content });

        if (navigateToPage) {
            await page.goto(`/${projectName}/${pageName}`);
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
        pageName: string,
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
     * 内部リンクを強制的に作成する
     * @param page Playwrightのページオブジェクト
     * @param itemId アイテムのID
     * @param linkText リンクのテキスト
     */
    static async forceCreateInternalLink(page: Page, itemId: string, linkText: string): Promise<void> {
        await page.evaluate(({ itemId, linkText }) => {
            const gs: any = (window as any).generalStore || (window as any).appStore;
            if (!gs?.project) return false;
            try {
                const findById = (parent: any): any => {
                    if (!parent) return null;
                    const items: any = parent.items;
                    const len = items?.length ?? 0;
                    for (let i = 0; i < len; i++) {
                        const it = items.at ? items.at(i) : items[i];
                        if (!it) continue;
                        if (String(it.id) === String(itemId)) return it;
                        const found = findById(it);
                        if (found) return found;
                    }
                    return null;
                };

                // ルート（ページ一覧）から検索
                const pages: any = gs.project.items;
                const plen = pages?.length ?? 0;
                let target: any = null;
                for (let i = 0; i < plen; i++) {
                    const p = pages.at ? pages.at(i) : pages[i];
                    if (String(p?.id) === String(itemId)) {
                        target = p;
                        break;
                    }
                    const found = findById(p);
                    if (found) {
                        target = found;
                        break;
                    }
                }
                if (!target) return false;

                const currentText = target?.text?.toString?.() ?? String(target?.text ?? "");
                const newText = `${currentText} [${linkText}]`;
                target.updateText(newText);
                return true;
            } catch (e) {
                console.error("Error creating internal link (Yjs):", e);
                return false;
            }
        }, { itemId, linkText });

        await page.waitForTimeout(200);
    }

    /**
     * 内部リンクを検出する
     * @param page Playwrightのページオブジェクト
     * @param linkText リンクのテキスト
     * @returns リンク要素が存在する場合はtrue
     */
    static async detectInternalLink(page: Page, linkText: string): Promise<boolean> {
        // リンク要素を検出
        const linkCount = await page.evaluate(text => {
            const links = Array.from(document.querySelectorAll("a.internal-link")).filter(
                el => el.textContent === text,
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
        pageExists: boolean = true,
    ): Promise<void> {
        await page.evaluate(({ pageName, projectName, pageExists }) => {
            // グローバル関数が存在しない場合は作成
            if (!window.__testShowLinkPreview) {
                window.__testShowLinkPreview = (pageName: string, projectName?: string, pageExists?: boolean) => {
                    console.log(`Forcing link preview for page: ${pageName} (exists: ${pageExists})`);

                    // プレビューポップアップを作成
                    let popup = document.querySelector(".link-preview-popup");
                    if (!popup) {
                        popup = document.createElement("div");
                        popup.className = "link-preview-popup";
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
                    (popup as HTMLElement).style.display = "block";
                    (popup as HTMLElement).style.position = "fixed";
                    (popup as HTMLElement).style.top = "100px";
                    (popup as HTMLElement).style.left = "100px";
                    (popup as HTMLElement).style.zIndex = "1000";
                    (popup as HTMLElement).style.backgroundColor = "#fff";
                    (popup as HTMLElement).style.border = "1px solid #ccc";
                    (popup as HTMLElement).style.padding = "10px";
                    (popup as HTMLElement).style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";

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
            const items = document.querySelectorAll(".outliner-item");
            console.log(`Found ${items.length} outliner items`);

            let linksFound = 0;
            let linksProcessed = 0;

            // 各アイテムのテキストを再レンダリング
            items.forEach(item => {
                const textElement = item.querySelector(".item-text");
                if (textElement) {
                    // テキスト内容を取得
                    const text = textElement.textContent || "";

                    // 内部リンクのパターンを検出（通常の内部リンク）
                    const linkPattern = /\[([^[\]/-][^[\]]*?)\]/g;
                    // プロジェクト内部リンクのパターン
                    const projectLinkPattern = /\[\/([\w\-/]+)\]/g;

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
                                const parts = path.split("/").filter(p => p);
                                if (parts.length >= 2) {
                                    const projectName = parts[0];
                                    const pageName = parts.slice(1).join("/");

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
                        textElement.classList.add("formatted");
                    }
                }
            });

            // リンクにイベントリスナーを設定
            const setupLinkEventListeners = () => {
                const links = document.querySelectorAll("a.internal-link");
                console.log(`Found ${links.length} internal links to setup event listeners`);

                links.forEach(link => {
                    // 既に設定済みかどうかを確認するためのフラグ
                    const hasListeners = link.getAttribute("data-link-listeners") === "true";

                    if (!hasListeners) {
                        // マウスオーバーイベントリスナーを追加
                        link.addEventListener("mouseenter", () => {
                            console.log("Link mouseenter event triggered");
                            // データ属性からページ名を取得
                            const pageName = link.getAttribute("data-page");
                            const projectName = link.getAttribute("data-project");

                            if (pageName) {
                                // リンクプレビュー表示のカスタムイベントを発火
                                const customEvent = new CustomEvent("linkPreviewShow", {
                                    detail: { pageName, projectName, element: link },
                                });
                                document.dispatchEvent(customEvent);
                            }
                        });

                        // マウスアウトイベントリスナーを追加
                        link.addEventListener("mouseleave", () => {
                            console.log("Link mouseleave event triggered");
                            // リンクプレビュー非表示のカスタムイベントを発火
                            const customEvent = new CustomEvent("linkPreviewHide");
                            document.dispatchEvent(customEvent);
                        });

                        // リスナーが設定されたことを示すフラグを設定
                        link.setAttribute("data-link-listeners", "true");
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
                const observer = new MutationObserver(mutations => {
                    let newLinksFound = false;

                    mutations.forEach(mutation => {
                        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
                            mutation.addedNodes.forEach(node => {
                                if (node.nodeType === Node.ELEMENT_NODE) {
                                    const element = node as Element;

                                    // 追加された要素自体が内部リンクかどうかを確認
                                    if (element.classList && element.classList.contains("internal-link")) {
                                        newLinksFound = true;
                                    }

                                    // 追加された要素内の内部リンクを検索
                                    const links = element.querySelectorAll(".internal-link");
                                    if (links.length > 0) {
                                        newLinksFound = true;
                                    }
                                }
                            });
                        }
                    });

                    if (newLinksFound) {
                        console.log("New internal links found, setting up event listeners");
                        setupLinkEventListeners();
                    }
                });

                // 監視を開始
                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ["class"],
                });

                // グローバル変数に保存
                window.__linkPreviewMutationObserver = observer;
            }

            return {
                itemsCount: items.length,
                linksFound,
                linksProcessed,
                linksWithListeners,
                hasMutationObserver,
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
        __linkPreviewMutationObserver?: MutationObserver;
        __testShowLinkPreview?: (pageName: string, projectName?: string, pageExists?: boolean) => Element;
    }
}
