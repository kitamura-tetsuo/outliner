import { Items, Project } from "../schema/app-schema";

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

function toPlainText(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") return value;
    const toStr = (value as { toString?: unknown; }).toString;
    if (typeof toStr === "function") {
        return toStr.call(value);
    }
    return String(value ?? "");
}

type HasLength = { length?: unknown; };
export type ArrayLikeWithAt<T = unknown> = {
    length: number;
    at?(index: number): T | undefined;
    [index: number]: T | undefined;
};
type NodeLike = {
    id?: unknown;
    text?: unknown;
    items?: Items | ArrayLikeWithAt<NodeLike> | undefined;
    updateText?: (t: string) => void;
};

function isArrayLike<T = unknown>(value: unknown): value is ArrayLikeWithAt<T> {
    const len = (value as HasLength)?.length;
    return typeof len === "number" && len >= 0;
}

function collectItems(items: Items | ArrayLikeWithAt<NodeLike> | null | undefined): SnapshotItem[] {
    if (!items) return [];
    const list = isArrayLike<NodeLike>(items as unknown) ? (items as unknown as ArrayLikeWithAt<NodeLike>) : null;
    if (!list) return [];
    const result: SnapshotItem[] = [];
    for (let i = 0; i < list.length; i++) {
        const node = list.at ? list.at(i) : list[i];
        if (!node) continue;
        const n = node as NodeLike;
        const text = toPlainText(n.text);
        const children = collectItems(n.items as Items | ArrayLikeWithAt<NodeLike> | undefined);
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

function populateChildren(items: Items, children: SnapshotItem[]) {
    if (!items) return;
    for (const child of children) {
        const node = items.addNode("snapshot");
        if (typeof node.updateText === "function") {
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

interface SnapshotClient {
    containerId: string;
    clientId: string;
    getProject(): Project;
    getTree(): Items;
    isContainerConnected: boolean;
    getAllData(): AllData;
    getTreeAsJson(): AllData;
    dispose(): void;
    readonly connectionState: "Connected";
    getConnectionStateString(): string;
}

interface WindowWithYjsRegistry {
    __YJS_CLIENT_REGISTRY__?: Map<string, [SnapshotClient, Project]>;
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
        get connectionState(): "Connected" {
            return "Connected" as const;
        },
        getConnectionStateString() {
            return "接続済み";
        },
    };
    try {
        if (typeof window !== "undefined") {
            const registry = (window as unknown as WindowWithYjsRegistry).__YJS_CLIENT_REGISTRY__;
            if (registry?.set) {
                const key = `snapshot:${projectName}:${Date.now().toString(16)}`;
                registry.set(key, [client, project]);
            }
        }
    } catch {}
    return client;
}

type AllDataNode = { id: string; text: string; items: AllDataNode[]; };
type AllData = { items: AllDataNode[]; };

function projectToAllData(project: Project): AllData {
    const walk = (items: Items): AllDataNode[] => {
        if (!items || typeof (items as { length?: unknown; }).length !== "number") return [];
        const result: AllDataNode[] = [];
        const length = (items as { length: number; }).length;
        for (let i = 0; i < length; i++) {
            // Type mismatch between Items.at() return type and array indexing
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const node = items.at ? items.at(i) : undefined;
            if (!node) continue;
            const text = node.text?.toString?.() ?? String((node as { text?: unknown; }).text ?? "");
            result.push({
                id: String((node as { id?: unknown; }).id ?? i),
                text,
                items: walk((node as { items: Items; }).items),
            });
        }
        return result;
    };
    return { items: walk(project.items) };
}
