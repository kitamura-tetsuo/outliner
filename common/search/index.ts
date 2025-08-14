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
    while (stack.length) {
        const item = stack.shift() as T;
        let replaced = 0;
        const newText = item.text.replace(regex, () => {
            replaced++;
            return replacement;
        });
        if (replaced > 0) {
            item.updateText ? item.updateText(newText) : (item.text = newText);
            count += replaced;
        }
        const children = item.items as any[] | undefined;
        if (children) {
            stack.push(...(children as T[]));
        }
    }
    return count;
}
