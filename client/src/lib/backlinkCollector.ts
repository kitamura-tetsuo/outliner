/**
 * バックリンク収集ユーティリティ
 *
 * このモジュールは、ページへのバックリンク（他のページからのリンク）を収集するための機能を提供します。
 */

import type { Item } from "../schema/yjs-schema";
import { store } from "../stores/store.svelte";
import { getLogger } from "./logger";

const logger = getLogger("BacklinkCollector");

/**
 * バックリンク情報の型定義
 */
export interface Backlink {
    /** リンク元のページID */
    sourcePageId: string;
    /** リンク元のページ名 */
    sourcePageName: string;
    /** リンクを含むアイテムID */
    sourceItemId: string;
    /** リンクを含むアイテムのテキスト */
    sourceItemText: string;
    /** リンクの前後のコンテキスト */
    context: string;
}

/**
 * 指定したページへのバックリンクを収集する
 * @param targetPageName 対象のページ名
 * @returns バックリンクの配列
 */
export function collectBacklinks(targetPageName: string): Backlink[] {
    if (!store.pages || !targetPageName) {
        return [];
    }

    const backlinks: Backlink[] = [];
    const normalizedTargetName = targetPageName.toLowerCase();

    // 正規表現をループの外で作成（パフォーマンス最適化）
    // [page-name] 形式
    const escapedTargetName = escapeRegExp(normalizedTargetName); // Note: RegExp "i" flag handles casing
    const internalLinkPattern = new RegExp(`\\[${escapedTargetName}\\]`, "i");

    // プロジェクト内部リンクの正規表現パターン
    // [/project-name/page-name] 形式
    const currentProject = store.project?.title || "";
    const escapedCurrentProject = escapeRegExp(currentProject);
    const projectLinkPattern = new RegExp(
        `\\[\\/${escapedCurrentProject}\\/${escapedTargetName}\\]`,
        "i",
    );

    // extractContext 用の汎用パターン（プロジェクト名が異なる場合も考慮）
    // NOTE: extractContext logic used `\\[\\/.+\\/${escapeRegExp(targetPageName)}\\]` which matches any project
    const anyProjectLinkPattern = new RegExp(`\\[\\/.+\\/${escapedTargetName}\\]`, "i");

    try {
        // すべてのページを検索
        const pages = store.pages.current;
        if (!pages) {
            return backlinks;
        }
        for (const page of pages) {
            const pageItem = page as any as Item;

            const pText = pageItem.text;
            const pageHasText = pText && pText.length > 0;
            const pageText = pageHasText ? String(pText) : "";

            // 対象ページ自身は除外
            if (pageHasText && pageText.toLowerCase() === normalizedTargetName) {
                continue;
            }

            // ページ自身のテキストをチェック
            // Fast path: check if text contains '[' before running regex
            if (pageHasText && pageText.includes("[") && (internalLinkPattern.test(pageText) || projectLinkPattern.test(pageText))) {
                backlinks.push({
                    sourcePageId: pageItem.id,
                    sourcePageName: pageText,
                    sourceItemId: pageItem.id,
                    sourceItemText: pageText,
                    context: extractContext(pageText, internalLinkPattern, anyProjectLinkPattern),
                });
            }

            // 子アイテムをチェック
            const items = pageItem.items as Iterable<Item> & { iterateUnordered?: () => Iterator<Item> };
            // Optimization: Iterate directly to avoid O(N log N) sorting caused by items.length check
            // (Items.length getter triggers a full sort of children keys in app-schema.ts)
            // Also prefer iterateUnordered to avoid sorting completely
            if (items) {
                const iterator = (typeof items.iterateUnordered === 'function')
                    ? { [Symbol.iterator]: () => items.iterateUnordered!() }
                    : items;

                for (const item of iterator) {
                    const text = item.text;
                    // Optimization: skip empty text to avoid expensive toString() (Y.Text deserialization)
                    if (!text || text.length === 0) continue;

                    const itemText = String(text);
                    // Fast path: check if text contains '[' before running regex
                    if (
                        item && itemText.includes("[")
                        && (internalLinkPattern.test(itemText) || projectLinkPattern.test(itemText))
                    ) {
                        backlinks.push({
                            sourcePageId: pageItem.id,
                            sourcePageName: pageText,
                            sourceItemId: item.id,
                            sourceItemText: itemText,
                            context: extractContext(itemText, internalLinkPattern, anyProjectLinkPattern),
                        });
                    }
                }
            }
        }

        logger.info(`Collected ${backlinks.length} backlinks for page: ${targetPageName}`);
        return backlinks;
    } catch (error) {
        logger.error({ error }, `Error collecting backlinks for page ${targetPageName}`);
        return [];
    }
}

/**
 * リンクの前後のコンテキストを抽出する
 * @param text 元のテキスト
 * @param internalLinkPattern 内部リンクパターン
 * @param projectLinkPattern プロジェクトリンクパターン
 * @returns コンテキスト文字列
 */
function extractContext(text: string, internalLinkPattern: RegExp, projectLinkPattern: RegExp): string {
    if (!text) return "";

    // リンクの位置を特定
    const internalMatch = text.match(internalLinkPattern);
    const projectMatch = text.match(projectLinkPattern);

    let linkPosition = -1;
    let linkLength = 0;

    if (internalMatch && internalMatch.index !== undefined) {
        linkPosition = internalMatch.index;
        linkLength = internalMatch[0].length;
    } else if (projectMatch && projectMatch.index !== undefined) {
        linkPosition = projectMatch.index;
        linkLength = projectMatch[0].length;
    }

    if (linkPosition === -1) return text;

    // リンクの前後20文字を抽出
    const contextStart = Math.max(0, linkPosition - 20);
    const contextEnd = Math.min(text.length, linkPosition + linkLength + 20);

    let context = text.substring(contextStart, contextEnd);

    // 前後に「...」を追加（必要な場合）
    if (contextStart > 0) {
        context = "..." + context;
    }
    if (contextEnd < text.length) {
        context = context + "...";
    }

    return context;
}

/**
 * 正規表現のために特殊文字をエスケープする
 * @param string エスケープする文字列
 * @returns エスケープされた文字列
 */
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 指定したページへのバックリンクの数を取得する
 * @param pageName ページ名
 * @returns バックリンクの数
 */
export function getBacklinkCount(pageName: string): number {
    return collectBacklinks(pageName).length;
}
