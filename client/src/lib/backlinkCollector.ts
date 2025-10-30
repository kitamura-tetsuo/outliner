/**
 * バックリンク収集ユーティリティ
 *
 * このモジュールは、ページへのバックリンク（他のページからのリンク）を収集するための機能を提供します。
 */

import type { Item } from "../schema/app-schema";
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

    try {
        // すべてのページを検索
        for (const page of store.pages.current as unknown[]) {
            // Type assert to access properties
            const pageData = page as { id: string; text: string | { toString(): string; }; items?: any; };
            const pageText = typeof pageData.text === "string" ? pageData.text : pageData.text?.toString() ?? "";
            const pageId = pageData.id;

            // 対象ページ自身は除外
            if (pageText.toLowerCase() === normalizedTargetName) {
                continue;
            }

            // ページ自身のテキストをチェック
            if (containsLink(pageText, normalizedTargetName)) {
                backlinks.push({
                    sourcePageId: pageId,
                    sourcePageName: pageText,
                    sourceItemId: pageId,
                    sourceItemText: pageText,
                    context: extractContext(pageText, normalizedTargetName),
                });
            }

            // 子アイテムをチェック
            const items = pageData.items;
            if (items && items.length > 0) {
                for (let i = 0; i < items.length; i++) {
                    const item = items[i] as { id: string; text: string | { toString(): string; }; };
                    const itemText = typeof item.text === "string" ? item.text : item.text?.toString() ?? "";
                    if (item && containsLink(itemText, normalizedTargetName)) {
                        backlinks.push({
                            sourcePageId: pageId,
                            sourcePageName: pageText,
                            sourceItemId: item.id,
                            sourceItemText: itemText,
                            context: extractContext(itemText, normalizedTargetName),
                        });
                    }
                }
            }
        }

        logger.info(`Collected ${backlinks.length} backlinks for page: ${targetPageName}`);
        return backlinks;
    } catch (error) {
        logger.error(`Error collecting backlinks for page ${targetPageName}:`, error);
        return [];
    }
}

/**
 * テキストに指定したページへのリンクが含まれているかチェックする
 * @param text チェックするテキスト
 * @param targetPageName 対象のページ名（小文字）
 * @returns リンクが含まれている場合はtrue
 */
function containsLink(text: string, targetPageName: string): boolean {
    if (!text) return false;

    // 内部リンクの正規表現パターン
    // [page-name] 形式
    const internalLinkPattern = new RegExp(`\\[${escapeRegExp(targetPageName)}\\]`, "i");

    // プロジェクト内部リンクの正規表現パターン
    // [/project-name/page-name] 形式
    // 現在のプロジェクト名を取得
    const currentProject = store.project?.title || "";
    const projectLinkPattern = new RegExp(
        `\\[\\/${escapeRegExp(currentProject)}\\/${escapeRegExp(targetPageName)}\\]`,
        "i",
    );

    return internalLinkPattern.test(text) || projectLinkPattern.test(text);
}

/**
 * リンクの前後のコンテキストを抽出する
 * @param text 元のテキスト
 * @param targetPageName 対象のページ名（小文字）
 * @returns コンテキスト文字列
 */
function extractContext(text: string, targetPageName: string): string {
    if (!text) return "";

    // 内部リンクの正規表現パターン
    const internalLinkPattern = new RegExp(`\\[${escapeRegExp(targetPageName)}\\]`, "i");
    const projectLinkPattern = new RegExp(`\\[\\/.+\\/${escapeRegExp(targetPageName)}\\]`, "i");

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
