export interface GraphNode {
    id: string;
    title: string;
}

export interface GraphLink {
    source: string;
    target: string;
}

export interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
}

export function buildGraphData(pages: Array<{ id: string; text: string }>): GraphData {
    const nodes: GraphNode[] = pages.map(p => ({ id: p.id, title: p.text }));
    const links: GraphLink[] = [];
    const internalLinkRegex = /\[([^\[\]\/\-][^\[\]]*?)\]/g;
    for (const page of pages) {
        let match: RegExpExecArray | null;
        while ((match = internalLinkRegex.exec(page.text))) {
            const targetTitle = match[1];
            const target = pages.find(p => p.text === targetTitle);
            if (target) {
                links.push({ source: page.id, target: target.id });
            }
        }
    }
    return { nodes, links };
}

