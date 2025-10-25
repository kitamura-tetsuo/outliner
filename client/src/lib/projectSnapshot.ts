import { Project } from "../schema/app-schema";

export type SnapshotItem = {
    text: string;
    children: SnapshotItem[];
};

export type ProjectSnapshot = {
    title: string;
    items: SnapshotItem[];
};

const STORAGE_PREFIX = "outliner:project-snapshot:";

function hasWindowStorage(): boolean {
    return typeof window !== "undefined" && ("sessionStorage" in window || "localStorage" in window);
}

function getStorageKey(title: string): string {
    return `${STORAGE_PREFIX}${encodeURIComponent(title || "__untitled__")}`;
}

function toPlainText(value: any): string {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value.toString === "function") {
        return value.toString();
    }
    return String(value ?? "");
}

function collectItems(items: any): SnapshotItem[] {
    if (!items || typeof items.length !== "number") return [];
    const result: SnapshotItem[] = [];
    const length = items.length as number;
    for (let i = 0; i < length; i++) {
        const node = items.at ? items.at(i) : items[i];
        if (!node) continue;
        const text = toPlainText(node.text);
        const children = collectItems(node.items);
        result.push({ text, children });
    }
    return result;
}

function isPlaceholder(snapshot: ProjectSnapshot): boolean {
    if (!snapshot.items.length) return true;
    if (snapshot.items.length === 1) {
        const [first] = snapshot.items;
        if (first.text === "settings" && first.children.length === 0) {
            return true;
        }
    }
    return false;
}

const DEFAULT_CHILD_TEXTS = new Set([
    "一行目: テスト",
    "二行目: Yjs 反映",
    "三行目: 並び順チェック",
]);

function hasMeaningfulContent(snapshot: ProjectSnapshot): boolean {
    const hasNonDefaultChildren = (children: SnapshotItem[] | undefined): boolean => {
        if (!children || children.length === 0) return false;
        return children.some(child => {
            if (!DEFAULT_CHILD_TEXTS.has(child.text)) return true;
            return hasNonDefaultChildren(child.children);
        });
    };

    return snapshot.items.some(root => {
        if (hasNonDefaultChildren(root.children)) return true;
        // No non-default children; treat as placeholder if children exist but all default.
        return root.children === undefined || root.children.length === 0;
    });
}

export function saveProjectSnapshot(project: Project | undefined): void {
    if (!project || !hasWindowStorage()) return;
    try {
        const snapshot: ProjectSnapshot = {
            title: project.title ?? "",
            items: collectItems(project.items as any),
        };
        if (isPlaceholder(snapshot)) return;
        if (!hasMeaningfulContent(snapshot)) return;
        const key = getStorageKey(snapshot.title);
        const payload = JSON.stringify(snapshot);
        try {
            window.sessionStorage?.setItem(key, payload);
        } catch {}
        try {
            window.localStorage?.setItem(key, payload);
        } catch {}
    } catch {
        /* noop */
    }
}

export function loadProjectSnapshot(title: string | undefined): ProjectSnapshot | null {
    if (!title || !hasWindowStorage()) return null;
    try {
        const key = getStorageKey(title);
        const sources = [() => window.sessionStorage?.getItem(key), () => window.localStorage?.getItem(key)];
        for (const get of sources) {
            try {
                const raw = get();
                if (!raw) continue;
                const data = JSON.parse(raw) as ProjectSnapshot;
                if (!data || !Array.isArray(data.items)) continue;
                return data;
            } catch {}
        }
        return null;
    } catch {
        return null;
    }
}

function markdownFromItems(items: SnapshotItem[], depth = 0, lines: string[] = []): string[] {
    const indent = "  ".repeat(depth);
    for (const item of items) {
        lines.push(`${indent}- ${item.text}`);
        markdownFromItems(item.children, depth + 1, lines);
    }
    return lines;
}

export function snapshotToMarkdown(snapshot: ProjectSnapshot): string {
    return markdownFromItems(snapshot.items).join("\n");
}

function opmlFromItems(items: SnapshotItem[], output: string[]): void {
    for (const item of items) {
        output.push(`<outline text="${escapeHtml(item.text)}">`);
        opmlFromItems(item.children, output);
        output.push("</outline>");
    }
}

export function snapshotToOpml(snapshot: ProjectSnapshot): string {
    const output: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', "<opml><body>"];
    opmlFromItems(snapshot.items, output);
    output.push("</body></opml>");
    return output.join("");
}

export function snapshotToProject(snapshot: ProjectSnapshot): Project {
    const project = Project.createInstance(snapshot.title || "Untitled Project");
    const _rootItems: any = project.items as any;

    for (const root of snapshot.items) {
        const page = project.addPage(root.text, "snapshot");
        populateChildren(page.items as any, root.children);
    }

    return project;
}

function populateChildren(items: any, children: SnapshotItem[]) {
    if (!items) return;
    for (const child of children) {
        const node = items.addNode ? items.addNode("snapshot") : null;
        if (!node) continue;
        if (node.updateText) {
            node.updateText(child.text);
        }
        populateChildren(node.items as any, child.children);
    }
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function createSnapshotClient(projectName: string, project: Project): any {
    const client = {
        containerId: `snapshot-${encodeURIComponent(projectName || "")}`,
        clientId: `snapshot-${Date.now().toString(16)}`,
        getProject: () => project,
        getTree: () => project.items,
        isContainerConnected: true,
        getAllData: () => projectToAllData(project),
        getTreeAsJson: (_path?: string) => projectToAllData(project),
        dispose: () => {},
        get connectionState() {
            return "Connected";
        },
        getConnectionStateString() {
            return "接続済み";
        },
    };
    try {
        if (typeof window !== "undefined") {
            const registry = (window as any).__YJS_CLIENT_REGISTRY__;
            if (registry?.set) {
                const key = `snapshot:${projectName}:${Date.now().toString(16)}`;
                registry.set(key, [client, project]);
            }
        }
    } catch {}
    return client;
}

function projectToAllData(project: Project): any {
    const walk = (items: any): any[] => {
        if (!items || typeof items.length !== "number") return [];
        const result: any[] = [];
        const length = items.length as number;
        for (let i = 0; i < length; i++) {
            const node = items.at ? items.at(i) : items[i];
            if (!node) continue;
            const text = node.text?.toString?.() ?? String(node.text ?? "");
            result.push({
                id: String(node.id ?? i),
                text,
                items: walk(node.items),
            });
        }
        return result;
    };
    return { items: walk(project.items as any) };
}
