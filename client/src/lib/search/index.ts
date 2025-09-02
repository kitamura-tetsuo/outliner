// import { Tree } from "fluid-framework"; // Yjsモードでは無効化
import { Item, Tree } from "../../schema/app-schema";
import { Items, Project } from "../../schema/app-schema";
// import { fluidStore } from "../../stores/fluidStore.svelte"; // Yjsモードでは無効化
import { getLogger } from "../logger";
import { YjsProjectManager } from "../yjsProjectManager.svelte";

const logger = getLogger();

// ページアイテムを見つけるヘルパー関数（Yjsモードでは未使用のためスタブ）
function findPageItem(_item: Item): Item | null {
    // 親参照は追跡していないため、必要になればYjsOrderedTreeから解決する
    return null;
}

// Yjsにテキスト更新を適用するヘルパー関数
async function applyTextUpdateToYjs(item: Item, newText: string): Promise<void> {
    try {
        // Yjsモードでは簡易実装
        logger.info(`Yjs mode: Search/replace text update not implemented for item ${item.id} -> "${newText}"`);
        return;
    } catch (error) {
        // Yjsエラーは警告として記録するが、処理は継続
        logger.warn(`Failed to apply search/replace text update to Yjs: ${error}`);
    }
}

export interface SearchOptions {
    regex?: boolean;
    caseSensitive?: boolean;
}

export interface MatchPosition {
    index: number;
    length: number;
}

export interface ItemMatch<T> {
    item: T;
    matches: MatchPosition[];
}

export function buildRegExp(query: string, options: SearchOptions = {}): RegExp {
    const flags = options.caseSensitive ? "g" : "gi";
    if (options.regex) {
        return new RegExp(query, flags);
    }
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(escaped, flags);
}

export function findMatches(text: string, query: string, options: SearchOptions = {}): MatchPosition[] {
    if (!query) return [];
    const regex = buildRegExp(query, options);
    const matches: MatchPosition[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
        matches.push({ index: m.index, length: m[0].length });
        if (m[0].length === 0) {
            regex.lastIndex++;
        }
    }
    return matches;
}

export function searchItems<T extends { text: string; items?: any[]; id: string; }>(
    root: T,
    query: string,
    options: SearchOptions = {},
): Array<ItemMatch<T>> {
    const results: Array<ItemMatch<T>> = [];
    const stack: T[] = [root];
    while (stack.length) {
        const item = stack.shift() as T;
        const matches = findMatches(item.text, query, options);
        if (matches.length) {
            results.push({ item, matches });
        }
        const children = item.items as any[] | undefined;
        if (children) {
            stack.push(...(children as T[]));
        }
    }
    return results;
}

export function replaceFirst<T extends { text: string; updateText?: (t: string) => void; items?: any[]; }>(
    root: T,
    query: string,
    replacement: string,
    options: SearchOptions = {},
): boolean {
    const regex = buildRegExp(query, options);
    const stack: T[] = [root];
    while (stack.length) {
        const item = stack.shift() as T;
        const newText = item.text.replace(regex, replacement);
        if (newText !== item.text) {
            item.updateText ? item.updateText(newText) : (item.text = newText);
            return true;
        }
        const children = item.items as any[] | undefined;
        if (children) {
            stack.push(...(children as T[]));
        }
    }
    return false;
}

export function replaceAll<T extends { text: string; updateText?: (t: string) => void; items?: any[]; }>(
    root: T,
    query: string,
    replacement: string,
    options: SearchOptions = {},
): number {
    const regex = buildRegExp(query, options);
    let count = 0;
    const stack: T[] = [root];

    console.log(`[replaceAll] Starting replacement: query="${query}", replacement="${replacement}"`);
    console.log(`[replaceAll] Root item: id=${(root as any).id}, text="${root.text}"`);

    while (stack.length) {
        const item = stack.shift() as T;
        console.log(`[replaceAll] Processing item: id=${(item as any).id}, text="${item.text}"`);

        try {
            let replaced = 0;
            const newText = item.text.replace(regex, () => {
                replaced++;
                return replacement;
            });

            if (replaced > 0) {
                console.log(
                    `[replaceAll] Replacing ${replaced} matches in item ${
                        (item as any).id
                    }: "${item.text}" -> "${newText}"`,
                );
                item.updateText ? item.updateText(newText) : (item.text = newText);

                // Yjs統合: 並行してYjsテキストを更新（Itemの場合のみ）
                if (item.updateText && Tree.is(item, Item)) {
                    applyTextUpdateToYjs(item as unknown as Item, newText);
                }

                count += replaced;
            } else {
                console.log(`[replaceAll] No matches found in item ${(item as any).id}: "${item.text}"`);
            }

            const children = item.items as any[] | undefined;
            if (children) {
                console.log(`[replaceAll] Adding ${children.length} children to stack from item ${(item as any).id}`);
                stack.push(...(children as T[]));
            }
        } catch (error) {
            console.error(`[replaceAll] Error processing item ${(item as any).id}:`, error);
        }
    }

    console.log(`[replaceAll] Completed replacement: total replacements=${count}`);
    return count;
}
