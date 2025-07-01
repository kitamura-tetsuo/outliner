import { Project, Items } from "../schema/app-schema";

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function exportProjectToOpml(project: Project): string {
    let out = '<?xml version="1.0" encoding="UTF-8"?>';
    out += "<opml><body>";
    const walk = (items: Items) => {
        for (const item of items) {
            out += `<outline text="${escapeHtml(item.text)}">`;
            walk(item.items as Items);
            out += "</outline>";
        }
    };
    walk(project.items as Items);
    out += "</body></opml>";
    return out;
}

export function exportProjectToMarkdown(project: Project): string {
    const lines: string[] = [];
    const walk = (items: Items, depth = 0) => {
        for (const item of items) {
            lines.push(`${"  ".repeat(depth)}- ${item.text}`);
            walk(item.items as Items, depth + 1);
        }
    };
    walk(project.items as Items);
    return lines.join("\n");
}

export function importOpmlIntoProject(opml: string, project: Project) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(opml, "text/xml");
    const body = doc.querySelector("opml > body");
    if (!body) return;
    const rootItems = project.items as Items;
    while (rootItems.length > 0) {
        rootItems.removeAt(rootItems.length - 1);
    }
    const build = (parent: Items, el: Element, root = false) => {
        const text = el.getAttribute("text") || "";
        const node = root ? project.addPage(text, "import") : parent.addNode("import");
        node.updateText(text);
        for (const child of Array.from(el.children)) {
            if (child.tagName.toLowerCase() === "outline") {
                build(node.items as Items, child);
            }
        }
    };
    Array.from(body.children).forEach(child => build(project.items as Items, child, true));
}

export function importMarkdownIntoProject(md: string, project: Project) {
    const rootItems = project.items as Items;
    while (rootItems.length > 0) {
        rootItems.removeAt(rootItems.length - 1);
    }
    const lines = md.split(/\r?\n/);
    const stack: { indent: number; items: Items; root: boolean }[] = [
        { indent: -1, items: project.items as Items, root: true },
    ];
    for (const line of lines) {
        const m = line.match(/^(\s*)-\s+(.*)$/);
        if (!m) continue;
        const indent = m[1].length;
        const text = m[2];
        while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
            stack.pop();
        }
        const parentInfo = stack[stack.length - 1];
        const node = parentInfo.root
            ? project.addPage(text, "import")
            : parentInfo.items.addNode("import");
        node.updateText(text);
        stack.push({ indent, items: node.items as Items, root: false });
    }
}
