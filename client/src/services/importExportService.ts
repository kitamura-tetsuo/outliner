import { Items, Project } from "../schema/app-schema";

function escapeHtml(str: unknown): string {
    const s = (typeof str === "string" || (str != null && typeof (str as object)?.toString === "function"))
        ? String(str ?? "")
        : "";
    return s
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
    // Export all pages in the project
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
    // Export all pages in the project
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

    let isFirstRootItem = true;

    const build = (parent: Items, el: Element, isRootLevel = false) => {
        const text = el.getAttribute("text") || "";

        // Create only the first root level item as a page
        const node = (isRootLevel && isFirstRootItem)
            ? project.addPage(text, "import")
            : parent.addNode("import");

        node.updateText(text);

        // Update flag after processing the first root item
        if (isRootLevel && isFirstRootItem) {
            isFirstRootItem = false;
        }

        for (const child of Array.from(el.children)) {
            if (child.tagName.toLowerCase() === "outline") {
                build(node.items as Items, child, false);
            }
        }
    };

    Array.from(body.children).forEach(child => build(project.items as Items, child, true));
}

export function importMarkdownIntoProject(md: string, project: Project) {
    console.log("importMarkdownIntoProject: Starting import with markdown:", md);

    const rootItems = project.items as Items;
    while (rootItems.length > 0) {
        rootItems.removeAt(rootItems.length - 1);
    }
    const lines = md.split(/\r?\n/);
    console.log("importMarkdownIntoProject: Lines to process:", lines);

    // Simplify stack structure
    const stack: { indent: number; items: Items; }[] = [
        { indent: -1, items: project.items as Items },
    ];

    let isFirstRootItem = true;
    let firstPageItems: Items | null = null;

    for (const line of lines) {
        const m = line.match(/^(\s*)-\s+(.*)$/);
        if (!m) continue;
        const indent = m[1].length;
        const text = m[2];

        console.log(`importMarkdownIntoProject: Processing line "${line}" -> indent=${indent}, text="${text}"`);

        // Return stack to appropriate level
        while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
            stack.pop();
        }

        const parentInfo = stack[stack.length - 1];
        console.log(
            `importMarkdownIntoProject: Parent stack level: ${stack.length}, parent indent: ${parentInfo.indent}`,
        );

        let node;
        if (isFirstRootItem && indent === 0) {
            // Create only the first root level item as a page
            console.log(`importMarkdownIntoProject: Creating page "${text}"`);
            node = project.addPage(text, "import");
            firstPageItems = node.items as Items;
            isFirstRootItem = false;
        } else if (indent === 0 && firstPageItems) {
            // Create subsequent root level items as children of the first page
            console.log(`importMarkdownIntoProject: Creating root-level child "${text}" under first page`);
            node = firstPageItems.addNode("import");
            node.updateText(text);
        } else {
            // Create as a normal child item
            console.log(`importMarkdownIntoProject: Creating child "${text}" under parent`);
            node = parentInfo.items.addNode("import");
            node.updateText(text);
        }

        console.log(`importMarkdownIntoProject: Created node "${node.text}" with ${node.items?.length || 0} children`);

        // Add stack info for the next item
        stack.push({
            indent,
            items: node.items as Items,
        });
    }

    console.log(`importMarkdownIntoProject: Import completed. Project has ${project.items.length} root items`);
    if (project.items.length > 0) {
        const firstItem = project.items.at(0);
        if (firstItem) {
            console.log(
                `importMarkdownIntoProject: First item "${firstItem.text}" has ${
                    firstItem.items?.length || 0
                } children`,
            );
        }
    }
}
