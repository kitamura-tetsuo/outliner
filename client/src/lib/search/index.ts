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

function toStringSafe(text: unknown): string {
    if (text == null) return "";
    if (typeof text === "string") return text;
    try {
        if (typeof text.toString === "function") return text.toString();
    } catch {}
    return String(text);
}

function pushChildren<T>(stack: T[], children: unknown): void {
    if (!children) return;
    try {
        if (typeof children[Symbol.iterator] === "function") {
            for (const ch of children as unknown[]) stack.push(ch as T);
            return;
        }
    } catch {}
    const len = (children as { length: number; }).length;
    if (typeof len === "number" && len >= 0) {
        for (let i = 0; i < len; i++) {
            const v = (children as { at?: (i: number) => unknown; })[i];
            if (typeof v !== "undefined") stack.push(v as T);
        }
        return;
    }
}

export function searchItems<T extends { text: string; items?: unknown; id: string; }>(
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

export function replaceFirst<T extends { text: string; updateText?: (t: string) => void; items?: unknown; }>(
    root: T,
    query: string,
    replacement: string,
    options: SearchOptions = {},
): boolean {
    const regex = buildRegExp(query, options);
    const stack: T[] = [root];
    while (stack.length) {
        const item = stack.shift() as T;
        const text = toStringSafe(item.text);
        const newText = text.replace(regex, replacement);
        if (newText !== text) {
            if (item.updateText) {
                item.updateText(newText);
            } else {
                item.text = newText;
            }
            return true;
        }
        const children = item.items;
        pushChildren<T>(stack, children);
    }
    return false;
}

export function replaceAll<T extends { text: string; updateText?: (t: string) => void; items?: unknown; }>(
    root: T,
    query: string,
    replacement: string,
    options: SearchOptions = {},
): number {
    const regex = buildRegExp(query, options);
    let count = 0;
    const stack: T[] = [root];
    while (stack.length) {
        const item = stack.shift() as T;
        const text = toStringSafe(item.text);
        let replaced = 0;
        const newText = text.replace(regex, () => {
            replaced++;
            return replacement;
        });
        if (replaced > 0) {
            if (item.updateText) {
                item.updateText(newText);
            } else {
                item.text = newText;
            }
            count += replaced;
        }
        const children = item.items;
        pushChildren<T>(stack, children);
    }
    return count;
}
