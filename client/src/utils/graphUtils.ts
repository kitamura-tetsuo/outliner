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

function toArray(p: any): any[] {
    try {
        if (Array.isArray(p)) return p;
        if (p && typeof p[Symbol.iterator] === "function") return Array.from(p);
        const len = p?.length;
        if (typeof len === "number" && len >= 0) {
            const r: any[] = [];
            for (let i = 0; i < len; i++) r.push(p.at ? p.at(i) : p[i]);
            return r;
        }
    } catch {}
    return [] as any[];
}

function getText(v: any): string {
    try {
        if (typeof v === "string") return v;
        if (v?.text !== undefined) {
            const t = v.text;
            if (typeof t === "string") return t;
            if (t && typeof t.toString === "function") return t.toString();
        }
        if (v && typeof v.toString === "function") return v.toString();
    } catch {}
    return String(v ?? "");
}

export function buildGraph(pagesMaybe: any, projectTitle: string): GraphData {
    const pages = toArray(pagesMaybe);
    const normalizedProjectTitle = (projectTitle || "").toLowerCase();

    // Pre-calculate node names and their lowercase versions to avoid
    // repeated toLowerCase() calls in the nested loop.
    const pageNodes = pages.map((p: { id: string; }) => {
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
        const childArr = toArray((src as any).items || []);
        const childTexts = childArr.map((i: any) => getText(i).toLowerCase());
        const texts = [srcText, ...childTexts];

        for (const dst of pageNodes) {
            if (src.id === dst.id) continue;
            const target = dst.lowerName;

            // Check if any text block in src contains a link to dst
            // Using the optimized string inclusion check
            if (texts.some(t => containsLink(t, target, normalizedProjectTitle))) {
                links.push({ source: src.id, target: dst.id });
            }
        }
    }
    return { nodes, links };
}
