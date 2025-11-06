import { Project } from "../schema/app-schema";

export type SnapshotItem = {
    text: string;
    children: SnapshotItem[];
};

export type ProjectSnapshot = {
    title: string;
    items: SnapshotItem[];
};

type SnapshotClient = {
    containerId: string;
    clientId: string;
    getProject: () => Project;
    getTree: () => unknown;
    isContainerConnected: boolean;
    getAllData: () => { items: unknown[]; };
    getTreeAsJson: () => { items: unknown[]; };
    dispose: () => void;
    connectionState: string;
    getConnectionStateString: () => string;
};

type ProjectData = {
    items: unknown[];
};

const STORAGE_PREFIX = "outliner:project-snapshot:";

function hasWindowStorage(): boolean {
    return typeof window !== "undefined" && ("sessionStorage" in window || "localStorage" in window);
}

function getStorageKey(title: string): string {
    return `${STORAGE_PREFIX}${encodeURIComponent(title || "__untitled__")}`;
}

function toPlainText(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (
        typeof value === "object" && value !== null && "toString" in value
        && typeof (value as { toString: () => unknown; }).toString === "function"
    ) {
        return String((value as { toString: () => unknown; }).toString());
    }
    return String(value ?? "");
}

function collectItems(items: unknown): SnapshotItem[] {
    if (
        !items || typeof items !== "object" || items === null || !("length" in items)
        || typeof (items as { length: unknown; }).length !== "number"
    ) return [];
    const result: SnapshotItem[] = [];
    const itemsArray = items as { length: number; at?: (i: number) => unknown; [index: number]: unknown; };
    const length = itemsArray.length;
    for (let i = 0; i < length; i++) {
        const node = itemsArray.at ? itemsArray.at(i) : itemsArray[i];
        if (!node) continue;
        const text = toPlainText((node as { text: unknown; }).text);
        const children = collectItems((node as { items: unknown; }).items);
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
            items: collectItems(project.items),
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

    for (const root of snapshot.items) {
        const page = project.addPage(root.text, "snapshot");
        populateChildren(page.items, root.children);
    }

    return project;
}

function populateChildren(items: unknown, children: SnapshotItem[]) {
    if (!items || typeof items !== "object") return;
    const itemsObj = items as { addNode?: (type: string) => { updateText?: (text: string) => void; items: unknown; }; };
    for (const child of children) {
        const node = itemsObj.addNode ? itemsObj.addNode("snapshot") : null;
        if (!node) continue;
        if (node.updateText) {
            node.updateText(child.text);
        }
        populateChildren(node.items, child.children);
    }
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function createSnapshotClient(projectName: string, project: Project): SnapshotClient {
    const client: SnapshotClient = {
        containerId: `snapshot-${encodeURIComponent(projectName || "")}`,
        clientId: `snapshot-${Date.now().toString(16)}`,
        getProject: () => project,
        getTree: () => project.items,
        isContainerConnected: true,
        getAllData: () => projectToAllData(project),
        getTreeAsJson: () => projectToAllData(project),
        dispose: () => {},
        connectionState: "Connected",
        getConnectionStateString() {
            return "接続済み";
        },
    };
    try {
        if (typeof window !== "undefined") {
            const registry = (window as Window & { __YJS_CLIENT_REGISTRY__?: Map<string, [SnapshotClient, Project]>; })
                .__YJS_CLIENT_REGISTRY__;
            if (registry?.set) {
                const key = `snapshot:${projectName}:${Date.now().toString(16)}`;
                registry.set(key, [client, project]);
            }
        }
    } catch {}
    return client;
}

function projectToAllData(project: Project): ProjectData {
    const walk = (items: unknown): unknown[] => {
        if (
            !items || typeof items !== "object" || items === null || !("length" in items)
            || typeof (items as { length: unknown; }).length !== "number"
        ) return [];
        const result: unknown[] = [];
        const itemsArray = items as { length: number; at?: (i: number) => unknown; [index: number]: unknown; };
        const length = itemsArray.length;
        for (let i = 0; i < length; i++) {
            const node = itemsArray.at ? itemsArray.at(i) : itemsArray[i];
            if (!node) continue;
            const nodeObj = node as { text?: unknown; id?: unknown; items?: unknown; };
            const text = nodeObj.text?.toString?.() ?? String(nodeObj.text ?? "");
            result.push({
                id: String(nodeObj.id ?? i),
                text,
                items: walk(nodeObj.items),
            });
        }
        return result;
    };
    return { items: walk(project.items) };
}
