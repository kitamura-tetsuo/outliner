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
        if (p && typeof p === "object" && Symbol.iterator in p) return Array.from(p as Iterable<unknown>);
        const obj = p as { length?: unknown; };
        const len = obj.length;
        if (typeof len === "number" && len >= 0) {
            const r: unknown[] = [];
            const arrayLike = p as { at?: (i: number) => unknown; [index: number]: unknown; };
            for (let i = 0; i < len; i++) r.push(arrayLike.at ? arrayLike.at(i) : arrayLike[i]);
            return r;
        }
    } catch {}
    return [];
}

function getText(v: unknown): string {
    try {
        if (typeof v === "string") return v;
        const obj = v as { text?: unknown; };
        if (obj?.text !== undefined) {
            const t = obj.text;
            if (typeof t === "string") return t;
            if (
                t && typeof t === "object" && "toString" in t
                && typeof (t as { toString: () => string; }).toString === "function"
            ) {
                return (t as { toString: () => string; }).toString();
            }
        }
        if (
            v && typeof v === "object" && v !== null && "toString" in v
            && typeof (v as { toString: () => string; }).toString === "function"
        ) {
            return (v as { toString: () => string; }).toString();
        }
    } catch {}
    return String(v ?? "");
}

export function buildGraph(pagesMaybe: unknown, projectTitle?: string): GraphData {
    const pages = toArray(pagesMaybe);

    const nodes = pages.map((p: unknown) => {
        const obj = p as { id?: unknown; text?: unknown; };
        return { id: String(obj.id ?? ""), name: getText(p) };
    });
    const links: { source: string; target: string; }[] = [];

    for (const src of pages) {
        const srcObj = src as { id?: unknown; items?: unknown; text?: unknown; };
        const srcText = getText(src).toLowerCase();
        const childArr = toArray((srcObj.items as unknown) || []);
        const childTexts = childArr.map((i: unknown) => getText(i).toLowerCase());
        const texts = [srcText, ...childTexts];

        for (const dst of pages) {
            const dstObj = dst as { id?: unknown; };
            if (srcObj.id === dstObj.id) continue;
            const target = getText(dst).toLowerCase();
            if (texts.some(t => containsLink(t, target, (projectTitle || "").toLowerCase()))) {
                links.push({ source: String(srcObj.id ?? ""), target: String(dstObj.id ?? "") });
            }
        }
    }
    return { nodes, links };
}
