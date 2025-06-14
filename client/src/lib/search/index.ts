export interface SearchMatch {
    itemId: string;
    path: string[];
    index: number;
    length: number;
}

export interface SearchOptions {
    regex?: boolean;
    caseSensitive?: boolean;
}

let wasmSearch: undefined | ((text: string, pattern: string, options: SearchOptions) => number[]);

async function loadWasm() {
    if (wasmSearch) return;
    try {
        const mod = await import("../../wasm-db/search");
        wasmSearch = mod.search;
    }
    catch (e) {
        // wasm db not available, fall back to js
    }
}

function buildRegex(pattern: string, options: SearchOptions): RegExp {
    let flags = options.caseSensitive ? "g" : "gi";
    if (!options.regex) {
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        pattern = escaped.replace(/\\\*/g, ".*").replace(/\\\?/g, ".");
    }
    return new RegExp(pattern, flags);
}

function searchText(text: string, pattern: RegExp): number[] {
    const indices: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
        indices.push(m.index);
        if (m[0].length === 0) {
            pattern.lastIndex++;
        }
    }
    return indices;
}

export async function searchItems(
    root: any,
    pattern: string,
    options: SearchOptions = {},
): Promise<SearchMatch[]> {
    await loadWasm();
    const regex = buildRegex(pattern, options);
    const results: SearchMatch[] = [];

    function traverse(node: any, path: string[]) {
        if (!node) return;
        const text = node.text as string | undefined;
        if (text) {
            const indices = wasmSearch ? wasmSearch(text, pattern, options) : searchText(text, regex);
            for (const idx of indices) {
                results.push({ itemId: node.id, path: [...path, node.id], index: idx, length: regex.source.length });
            }
        }
        if (node.items && node.items.length) {
            for (const child of node.items) {
                traverse(child, [...path, node.id]);
            }
        }
    }

    traverse(root, []);
    return results;
}

export async function replaceAll(
    root: any,
    pattern: string,
    replacement: string,
    options: SearchOptions = {},
): Promise<number> {
    const matches = await searchItems(root, pattern, options);
    for (const m of matches) {
        const item = findItem(root, m.path);
        if (item && typeof item.updateText === "function") {
            const regex = buildRegex(pattern, options);
            item.updateText((item.text as string).replace(regex, replacement));
        }
    }
    return matches.length;
}

function findItem(root: any, path: string[]) {
    let node = root;
    for (const id of path) {
        if (!node || !node.items) break;
        node = node.items.find((c: any) => c.id === id);
    }
    return node;
}
