export interface GraphData {
    nodes: Array<{ id: string; name: string; }>;
    links: Array<{ source: string; target: string; }>;
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

    // Pre-calculate page data to avoid repeated getText checks and lowercase conversions
    const pageData = pages.map((p: any) => ({
        id: p.id,
        name: getText(p),
        nameLower: getText(p).toLowerCase(),
    }));

    const nodes = pageData.map(p => ({ id: p.id, name: p.name }));
    const links: { source: string; target: string; }[] = [];

    const projectLower = (projectTitle || "").toLowerCase();

    for (const src of pages) {
        const srcText = getText(src).toLowerCase();
        const childArr = toArray((src as any).items || []);
        const childTexts = childArr.map((i: any) => getText(i).toLowerCase());
        const texts = [srcText, ...childTexts];

        for (const dst of pageData) {
            if (src.id === dst.id) continue;

            const target = dst.nameLower;
            // Optimization: Use includes instead of RegExp
            // Since all inputs are lowercased, this is equivalent to case-insensitive match
            // Avoiding RegExp construction in nested loop is a significant performance win
            const internalLink = `[${target}]`;
            const projectLink = `[/${projectLower}/${target}]`;

            const hasLink = texts.some(t => t.includes(internalLink) || t.includes(projectLink));

            if (hasLink) {
                links.push({ source: src.id, target: dst.id });
            }
        }
    }
    return { nodes, links };
}
