/**
 * リンクプレビュー機能を処理するモジュール
 *
 * このモジュールは、内部リンクにマウスオーバーした際にプレビューを表示する機能を提供します。
 * ScrapboxFormatterによって生成されたリンク要素に対して動作します。
 */

import type { Item } from "../schema/app-schema";
import { store } from "../stores/store.svelte";
import { getLogger } from "./logger";

const logger = getLogger("LinkPreviewHandler");

// プレビューポップアップのスタイル
const PREVIEW_STYLES = {
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
};

// 現在表示中のプレビュー要素
let currentPreview: HTMLElement | null = null;
// プレビュー表示タイマー
let previewTimer: number | null = null;
// プレビュー非表示タイマー
let hideTimer: number | null = null;

/**
 * ページが存在するかどうかを確認する
 * @param pageName ページ名
 * @param projectName プロジェクト名（オプション）
 * @returns ページが存在する場合はtrue
 */
export function pageExists(pageName: string, projectName?: string): boolean {
    // プロジェクト指定がある場合は、現在のプロジェクトと一致するか確認
    if (projectName && store.project?.title !== projectName) {
        return false;
    }

    if (!store.pages) return false;

    // ページ名が一致するページを検索
    for (const page of store.pages.current) {
        if (page.text.toLowerCase() === pageName.toLowerCase()) {
            return true;
        }
    }

    return false;
}

/**
 * ページ名からページを検索する
 * @param name ページ名
 * @returns ページアイテム、見つからない場合はnull
 */
function findPageByName(name: string): Item | null {
    if (!store.pages) return null;

    // ページ名が一致するページを検索
    for (const page of store.pages.current) {
        if (page.text.toLowerCase() === name.toLowerCase()) {
            return page;
        }
    }

    return null;
}

/**
 * プレビューコンテンツを生成する
 * @param pageName ページ名
 * @param projectName プロジェクト名（オプション）
 * @returns プレビュー用のHTML要素
 */
function createPreviewContent(pageName: string, projectName?: string): HTMLElement {
    const previewElement = document.createElement("div");
    previewElement.className = "link-preview-popup";

    // スタイルを適用
    Object.entries(PREVIEW_STYLES).forEach(([key, value]) => {
        previewElement.style[key as keyof CSSStyleDeclaration] = value;
    });

    // プロジェクト内リンクの場合
    if (projectName) {
        // 現在のプロジェクトと異なる場合は、プレビューを表示しない
        if (projectName !== store.project?.title) {
            const errorDiv = document.createElement("div");
            errorDiv.style.color = "#d32f2f";
            errorDiv.textContent = "別プロジェクトのページはプレビューできません";
            previewElement.appendChild(errorDiv);
            return previewElement;
        }
    }

    // ページを検索
    const foundPage = findPageByName(pageName);
    if (foundPage) {
        // ページが見つかった場合
        const contentDiv = document.createElement("div");

        // タイトル
        const titleElement = document.createElement("h3");
        titleElement.textContent = foundPage.text;
        titleElement.style.fontSize = "16px";
        titleElement.style.fontWeight = "600";
        titleElement.style.margin = "0 0 8px 0";
        titleElement.style.paddingBottom = "8px";
        titleElement.style.borderBottom = "1px solid #eee";
        titleElement.style.color = "#333";
        contentDiv.appendChild(titleElement);

        // アイテム一覧
        const itemsDiv = document.createElement("div");
        itemsDiv.style.maxHeight = "220px";
        itemsDiv.style.overflowY = "auto";

        const itemsList = foundPage.items as unknown as Array<{ text?: string; }>;
        if (itemsList && itemsList.length > 0) {
            const ul = document.createElement("ul");
            ul.style.margin = "0";
            ul.style.padding = "0 0 0 20px";

            // 最大5つまでのアイテムを表示
            const maxItems = Math.min(5, itemsList.length);
            for (let i = 0; i < maxItems; i++) {
                const item = itemsList[i];
                if (item) {
                    const li = document.createElement("li");
                    li.textContent = item.text || "";
                    li.style.marginBottom = "4px";
                    li.style.color = "#555";
                    li.style.lineHeight = "1.4";
                    ul.appendChild(li);
                }
            }

            // 5つ以上ある場合は「...」を表示
            if (itemsList.length > 5) {
                const moreLi = document.createElement("li");
                moreLi.textContent = "...";
                moreLi.style.color = "#888";
                moreLi.style.fontStyle = "italic";
                ul.appendChild(moreLi);
            }

            itemsDiv.appendChild(ul);
        } else {
            // アイテムがない場合
            const emptyP = document.createElement("p");
            emptyP.textContent = "このページには内容がありません";
            emptyP.style.color = "#888";
            emptyP.style.fontStyle = "italic";
            emptyP.style.margin = "10px 0";
            itemsDiv.appendChild(emptyP);
        }

        contentDiv.appendChild(itemsDiv);
        previewElement.appendChild(contentDiv);
    } else {
        // ページが見つからない場合
        const notFoundDiv = document.createElement("div");
        notFoundDiv.style.color = "#d32f2f";
        notFoundDiv.style.display = "flex";
        notFoundDiv.style.flexDirection = "column";
        notFoundDiv.style.alignItems = "center";
        notFoundDiv.style.justifyContent = "center";
        notFoundDiv.style.minHeight = "100px";

        const notFoundP = document.createElement("p");
        notFoundP.textContent = "ページが見つかりません";
        notFoundDiv.appendChild(notFoundP);

        previewElement.appendChild(notFoundDiv);
    }

    return previewElement;
}

/**
 * プレビューの位置を更新する
 * @param previewElement プレビュー要素
 * @param targetElement ターゲット要素（リンク）
 */
function updatePreviewPosition(previewElement: HTMLElement, targetElement: HTMLElement): void {
    const rect = targetElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // プレビューの幅と高さを取得（まだレンダリングされていない場合はデフォルト値を使用）
    const previewWidth = previewElement.offsetWidth || 300;
    const previewHeight = previewElement.offsetHeight || 200;

    // 初期位置（リンクの下）
    let top = rect.bottom + window.scrollY + 10;
    let left = rect.left + window.scrollX;

    // 画面の右端を超える場合は左に調整
    if (left + previewWidth > viewportWidth) {
        left = viewportWidth - previewWidth - 20;
    }

    // 画面の下端を超える場合は上に表示
    if (top + previewHeight > viewportHeight + window.scrollY) {
        top = rect.top + window.scrollY - previewHeight - 10;
    }

    previewElement.style.top = `${top}px`;
    previewElement.style.left = `${left}px`;
}

/**
 * リンクにマウスオーバーした際のハンドラ
 * @param event マウスイベント
 */
function handleLinkMouseEnter(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // 既存のタイマーをクリア
    if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
    }

    // 遅延してプレビューを表示（ユーザーが意図せずマウスオーバーした場合の表示を防ぐ）
    previewTimer = window.setTimeout(() => {
        // 既存のプレビューを削除
        if (currentPreview) {
            document.body.removeChild(currentPreview);
            currentPreview = null;
        }

        // データ属性からページ名とプロジェクト名を取得
        const pageName = target.dataset.page;
        const projectName = target.dataset.project;

        if (pageName) {
            // プレビューを作成
            const previewElement = createPreviewContent(pageName, projectName);

            // プレビューの位置を設定
            updatePreviewPosition(previewElement, target);

            // プレビューをDOMに追加
            document.body.appendChild(previewElement);

            // 現在のプレビューを保存
            currentPreview = previewElement;

            // プレビュー要素にもマウスイベントを設定
            previewElement.addEventListener("mouseenter", () => {
                // プレビュー上にマウスがある場合は非表示タイマーをクリア
                if (hideTimer !== null) {
                    window.clearTimeout(hideTimer);
                    hideTimer = null;
                }
            });

            previewElement.addEventListener("mouseleave", () => {
                // プレビューからマウスが離れたら非表示
                hidePreview();
            });
        }
    }, 300); // 300ms遅延
}

/**
 * リンクからマウスが離れた際のハンドラ
 */
function handleLinkMouseLeave(): void {
    // 表示タイマーをクリア
    if (previewTimer !== null) {
        window.clearTimeout(previewTimer);
        previewTimer = null;
    }

    // 遅延して非表示（ユーザーがプレビューに移動する時間を確保）
    hideTimer = window.setTimeout(() => {
        hidePreview();
    }, 200); // 200ms遅延
}

/**
 * プレビューを非表示にする
 */
function hidePreview(): void {
    if (currentPreview) {
        document.body.removeChild(currentPreview);
        currentPreview = null;
    }
}

// MutationObserverのインスタンス
let observer: MutationObserver | null = null;

/**
 * 指定された要素に内部リンクのイベントリスナーを設定する
 * @param element イベントリスナーを設定する要素
 */
function addLinkEventListeners(element: Element): void {
    // 既に設定済みかどうかを確認するためのフラグ
    const hasListeners = element.getAttribute("data-link-listeners") === "true";

    if (!hasListeners) {
        element.addEventListener("mouseenter", handleLinkMouseEnter);
        element.addEventListener("mouseleave", handleLinkMouseLeave);

        // リスナーが設定されたことを示すフラグを設定
        element.setAttribute("data-link-listeners", "true");

        logger.debug(`Link preview handlers added to ${element.textContent}`);
    }
}

/**
 * ページ内の内部リンクにイベントリスナーを設定する
 * この関数はページ読み込み後に呼び出す必要があります
 */
export function setupLinkPreviewHandlers(): void {
    try {
        // 内部リンクを取得
        const internalLinks = document.querySelectorAll(".internal-link");

        // 各リンクにイベントリスナーを設定
        internalLinks.forEach(link => {
            addLinkEventListeners(link);
        });

        // MutationObserverを設定（まだ設定されていない場合）
        if (!observer) {
            setupMutationObserver();
        }

        logger.info(`Link preview handlers set up for ${internalLinks.length} links`);
    } catch (error) {
        logger.error("Error setting up link preview handlers:", error);
    }
}

/**
 * DOM変更を監視するMutationObserverを設定する
 */
function setupMutationObserver(): void {
    try {
        // 既存のObserverをクリーンアップ
        if (observer) {
            observer.disconnect();
        }

        // 新しいObserverを作成
        observer = new MutationObserver(mutations => {
            let newLinksFound = false;

            // 各変更を処理
            mutations.forEach(mutation => {
                // 追加されたノードを処理
                if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // 追加された要素内の内部リンクを検索
                            const element = node as Element;

                            // 追加された要素自体が内部リンクかどうかを確認
                            if (element.classList && element.classList.contains("internal-link")) {
                                addLinkEventListeners(element);
                                newLinksFound = true;
                            }

                            // 追加された要素内の内部リンクを検索
                            const links = element.querySelectorAll(".internal-link");
                            if (links.length > 0) {
                                links.forEach(link => {
                                    addLinkEventListeners(link);
                                });
                                newLinksFound = true;
                            }
                        }
                    });
                }

                // 属性の変更を処理（クラスが変更された場合など）
                if (
                    mutation.type === "attributes"
                    && mutation.attributeName === "class"
                    && mutation.target.nodeType === Node.ELEMENT_NODE
                ) {
                    const element = mutation.target as Element;
                    if (element.classList && element.classList.contains("internal-link")) {
                        addLinkEventListeners(element);
                        newLinksFound = true;
                    }
                }
            });

            if (newLinksFound) {
                logger.debug("New internal links found and handlers added");
            }
        });

        // 監視を開始
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class"],
        });

        logger.info("MutationObserver for link preview handlers set up");
    } catch (error) {
        logger.error("Error setting up MutationObserver:", error);
    }
}

// ページ遷移時にプレビューをクリーンアップ
export function cleanupLinkPreviews(): void {
    // プレビュー要素をクリーンアップ
    if (currentPreview) {
        document.body.removeChild(currentPreview);
        currentPreview = null;
    }

    // タイマーをクリーンアップ
    if (previewTimer !== null) {
        window.clearTimeout(previewTimer);
        previewTimer = null;
    }

    if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
    }

    // MutationObserverをクリーンアップ
    if (observer) {
        observer.disconnect();
        observer = null;
        logger.info("MutationObserver for link preview handlers cleaned up");
    }
}
