export interface GraphData {
    nodes: Array<{ id: string; name: string; }>;
    links: Array<{ source: string; target: string; }>;
}

function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsLink(text: string, target: string, project: string): boolean {
    const internal = new RegExp(`\\[${escapeRegExp(target)}\\]`, "i");
    const projectPattern = new RegExp(`\\[\\/${escapeRegExp(project)}\\/${escapeRegExp(target)}\\]`, "i");
    return internal.test(text) || projectPattern.test(text);
}

function toArray(p: unknown): unknown[] {
    try {
        if (Array.isArray(p)) return p;
        if (p && typeof p[Symbol.iterator] === "function") return Array.from(p);
        const len = p?.length;
        if (typeof len === "number" && len >= 0) {
            const r: unknown[] = [];
            for (let i = 0; i < len; i++) r.push(p.at ? p.at(i) : p[i]);
            return r;
        }
    } catch {}
    return [];
}

function getText(v: unknown): string {
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

export function buildGraph(pagesMaybe: unknown, projectTitle: string): GraphData {
    const pages = toArray(pagesMaybe);

    const nodes = pages.map((p: unknown) => ({ id: p.id, name: getText(p) }));
    const links: { source: string; target: string; }[] = [];

    for (const src of pages) {
        const srcText = getText(src).toLowerCase();
        const childArr = toArray(src.items || []);
        const childTexts = childArr.map((i: unknown) => getText(i).toLowerCase());
        const texts = [srcText, ...childTexts];

        for (const dst of pages) {
            if (src.id === dst.id) continue;
            const target = getText(dst).toLowerCase();
            if (texts.some(t => containsLink(t, target, (projectTitle || "").toLowerCase()))) {
                links.push({ source: src.id, target: dst.id });
            }
        }
    }
    return { nodes, links };
}
