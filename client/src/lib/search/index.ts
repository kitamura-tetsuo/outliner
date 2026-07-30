import { getLogger } from "../../lib/logger";
const logger = getLogger("index");

export interface SearchOptions {
    regex?: boolean;
    caseSensitive?: boolean;
}

/**
 * Options for the replace helpers.
 *
 * `skipRoot` protects the root item from being rewritten. When a page tree is
 * passed as the root, that item holds the page title: renaming it changes the
 * page URL and dangles every incoming `[Page Title]` link, so callers must opt
 * in explicitly.
 */
export interface ReplaceOptions extends SearchOptions {
    skipRoot?: boolean;
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

function toStringSafe(text: unknown): string {
    if (text == null) return "";
    if (typeof text === "string") return text;
    try {
        const t = text as { toString?: () => string; };
        if (typeof t.toString === "function") return t.toString();
    } catch (_e) {
        logger.error(_e);
    }
    return String(text);
}

function pushChildren<T>(stack: T[], children: unknown): void {
    if (!children) return;
    try {
        const iterChildren = children as { [Symbol.iterator]?: () => Iterator<unknown>; };
        if (typeof iterChildren[Symbol.iterator] === "function") {
            for (const ch of (children as Iterable<unknown>)) stack.push(ch as T);
            return;
        }
    } catch (_e) {
        logger.error(_e);
    }
    const arrChildren = children as { length?: unknown; at?: (i: number) => unknown; } & Record<number, unknown>;
    const len = arrChildren.length;
    if (typeof len === "number" && len >= 0) {
        for (let i = 0; i < len; i++) {
            const v = typeof arrChildren.at === "function" ? arrChildren.at(i) : arrChildren[i];
            if (typeof v !== "undefined") stack.push(v as T);
        }
        return;
    }
}

export function searchItems<T extends { text: unknown; items?: unknown; id: string; }>(
    root: T,
    query: string,
    options: SearchOptions = {},
): Array<ItemMatch<T>> {
    const results: Array<ItemMatch<T>> = [];
    const stack: T[] = [root];
    while (stack.length) {
        const item = stack.shift() as T;
        const text = toStringSafe(item.text);
        const matches = findMatches(text, query, options);
        if (matches.length) {
            results.push({ item, matches });
        }
        const children = item.items;
        pushChildren<T>(stack, children);
    }
    return results;
}

function applyText<T extends { text: unknown; updateText?: (t: string) => void; }>(item: T, newText: string): void {
    if (item.updateText) {
        item.updateText(newText);
    } else {
        (item as { text: unknown; }).text = newText;
    }
}

/**
 * Locate the first item whose text a `replaceFirst` call would rewrite, without
 * modifying anything. Used to warn about page renames before they happen.
 */
export function findFirstReplaceTarget<T extends { text: unknown; items?: unknown; }>(
    root: T,
    query: string,
    replacement: string,
    options: ReplaceOptions = {},
): { item: T; newText: string; isRoot: boolean; } | undefined {
    if (!query) return undefined;
    const regex = buildRegExp(query, options);
    const stack: T[] = [root];
    while (stack.length) {
        const item = stack.shift() as T;
        const isRoot = item === root;
        if (!(isRoot && options.skipRoot)) {
            const text = toStringSafe(item.text);
            const newText = text.replace(regex, replacement);
            if (newText !== text) {
                return { item, newText, isRoot };
            }
        }
        const children = item.items;
        pushChildren<T>(stack, children);
    }
    return undefined;
}

export function replaceFirst<T extends { text: unknown; updateText?: (t: string) => void; items?: unknown; }>(
    root: T,
    query: string,
    replacement: string,
    options: ReplaceOptions = {},
): boolean {
    const found = findFirstReplaceTarget(root, query, replacement, options);
    if (!found) return false;
    applyText(found.item, found.newText);
    return true;
}

export function replaceAll<T extends { text: unknown; updateText?: (t: string) => void; items?: unknown; }>(
    root: T,
    query: string,
    replacement: string,
    options: ReplaceOptions = {},
): number {
    const regex = buildRegExp(query, options);
    let count = 0;
    const stack: T[] = [root];
    while (stack.length) {
        const item = stack.shift() as T;
        if (item === root && options.skipRoot) {
            pushChildren<T>(stack, item.items);
            continue;
        }
        const text = toStringSafe(item.text);
        let replaced = 0;
        const newText = text.replace(regex, () => {
            replaced++;
            return replacement;
        });
        if (replaced > 0) {
            applyText(item, newText);
            count += replaced;
        }
        const children = item.items;
        pushChildren<T>(stack, children);
    }
    return count;
}
