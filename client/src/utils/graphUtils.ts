export interface GraphData {
    nodes: Array<{ id: string; name: string; }>;
    links: Array<{ source: string; target: string; }>;
}

function containsLink(text: string, target: string, project: string): boolean {
    // text, target, and project are already lowercased.
    // We check for simple string inclusion of the link formats:
    // [target] or [/project/target]
    // This avoids expensive RegExp construction and execution in the O(N^2) loop.
    return text.includes(`[${target}]`) || text.includes(`[/${project}/${target}]`);
}

function toArray(p: unknown): unknown[] {
    try {
        if (Array.isArray(p)) return p;
        if (p && typeof (p as Iterable<unknown>)[Symbol.iterator] === "function") {
            return Array.from(p as Iterable<unknown>);
        }
        const len = (p as { length?: number; })?.length;
        if (typeof len === "number" && len >= 0) {
            const r: unknown[] = [];
            for (let i = 0; i < len; i++) {
                const item = p as { at?: (idx: number) => unknown; [key: number]: unknown; };
                r.push(item.at ? item.at(i) : item[i]);
            }
            return r;
        }
    } catch {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return [] as any[];
}

function getText(v: unknown): string {
    try {
        if (typeof v === "string") return v;
        const obj = v as { text?: unknown; toString?: () => string; };
        if (obj?.text !== undefined) {
            const t = obj.text;
            if (typeof t === "string") return t;
            if (t && typeof (t as { toString?: () => string; }).toString === "function") {
                return (t as { toString: () => string; }).toString();
            }
        }
        if (obj && typeof obj.toString === "function") return obj.toString();
    } catch {}
    return String(v ?? "");
}

export function buildGraph(pagesMaybe: unknown, projectTitle: string): GraphData {
    const pages = toArray(pagesMaybe);
    const normalizedProjectTitle = (projectTitle || "").toLowerCase();

    // Pre-calculate node names and their lowercase versions to avoid
    // repeated toLowerCase() calls in the nested loop.

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageNodes = pages.map((p: any) => {
        const name = getText(p);
        return {
            id: p.id,
            name: name,
            lowerName: name.toLowerCase(),
        };
    });

    const nodes = pageNodes.map(p => ({ id: p.id, name: p.name }));
    const links: { source: string; target: string; }[] = [];

    for (const src of pages) {
        const srcText = getText(src).toLowerCase();
        const childArr = toArray((src as { items?: unknown; }).items || []);
        const childTexts = childArr.map((i: unknown) => getText(i).toLowerCase());
        const texts = [srcText, ...childTexts];

        for (const dst of pageNodes) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((src as any).id === (dst as any).id) continue;
            const target = dst.lowerName;

            // Check if any text block in src contains a link to dst
            // Using the optimized string inclusion check
            if (texts.some(t => containsLink(t, target, normalizedProjectTitle))) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                links.push({ source: (src as any).id, target: (dst as any).id });
            }
        }
    }
    return { nodes, links };
}
