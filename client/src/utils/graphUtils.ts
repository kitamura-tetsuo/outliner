export interface GraphData {
    nodes: Array<{ id: string; name: string }>;
    links: Array<{ source: string; target: string }>;
}

function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsLink(text: string, target: string, project: string): boolean {
    const internal = new RegExp(`\\[${escapeRegExp(target)}\\]`, 'i');
    const projectPattern = new RegExp(`\\[\\/${escapeRegExp(project)}\\/${escapeRegExp(target)}\\]`, 'i');
    return internal.test(text) || projectPattern.test(text);
}

export function buildGraph(pages: any[], projectTitle: string): GraphData {
    const nodes = pages.map((p: any) => ({ id: p.id, name: p.text }));
    const links: { source: string; target: string }[] = [];
    for (const src of pages) {
        const texts = [src.text, ...((src.items as any[]) || []).map(i => i.text)];
        for (const dst of pages) {
            if (src.id === dst.id) continue;
            const target = dst.text.toLowerCase();
            if (texts.some(t => containsLink(t, target, projectTitle))) {
                links.push({ source: src.id, target: dst.id });
            }
        }
    }
    return { nodes, links };
}
