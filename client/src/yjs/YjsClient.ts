import type { Awareness } from "y-protocols/awareness";
import type { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

import { createProjectConnection, type PageConnection } from "../lib/yjs/connection";
import { yjsService } from "../lib/yjs/service";
import { Items, Project } from "../schema/yjs-schema";
import { presenceStore } from "../stores/PresenceStore.svelte";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function yCast<T = any>(obj: unknown): T {
    return obj as T;
}

export interface YjsClientParams {
    clientId: string;
    projectId: string;
    project: Project;
    doc?: Y.Doc;
    provider?: WebsocketProvider;
    awareness?: Awareness;
    getPageConnection?: (pageId: string) => PageConnection | undefined;
}

export class YjsClient {
    public readonly clientId: string;
    public readonly containerId: string; // keep name parity with FluidClient usages
    public readonly project: Project;

    private _doc?: Y.Doc;
    private _provider?: WebsocketProvider;
    private _awareness?: Awareness;
    private _getPageConnection?: (pageId: string) => PageConnection | undefined;

    constructor(params: YjsClientParams) {
        this.clientId = params.clientId;
        this.containerId = params.projectId; // mapped name
        this.project = params.project;
        this._doc = params.doc;
        this._provider = params.provider;
        this._awareness = params.awareness;
        this._getPageConnection = params.getPageConnection;

        // Attach presence binding when awareness exists
        try {
            if (this._awareness) {
                yjsService.bindProjectPresence(this._awareness);
            }
        } catch {}
    }

    // Build a client with active provider/awareness
    static async connect(projectId: string, project: Project): Promise<YjsClient> {
        const { doc, provider, awareness, getPageConnection } = await createProjectConnection(projectId);
        // Build a Project bound to the provider's doc to ensure schema/awareness consistency
        let connectedProject: Project = project;
        try {
            // Preserve title if present
            const title = project?.title ?? "";
            connectedProject = Project.fromDoc(doc);
            try {
                const meta = doc.getMap("metadata") as Y.Map<unknown>;
                if (title && !meta.get("title")) meta.set("title", title);
            } catch {}
        } catch {}
        const clientId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        return new YjsClient({
            clientId,
            projectId,
            project: connectedProject,
            doc,
            provider,
            awareness,
            getPageConnection,
        });
    }

    // Surface compatible with FluidClient
    public getProject() {
        return this.project;
    }

    public getTree() {
        return this.project.items as Items;
    }

    public getPageConnection(pageId: string): PageConnection | undefined {
        return this._getPageConnection?.(pageId);
    }

    public updatePresence(state: { cursor?: { itemId: string; offset: number; }; selection?: unknown; } | null) {
        if (!this._awareness) return;
        yjsService.setPresence(this._awareness, state);
    }

    public getAwareness(): Awareness | undefined {
        return this._awareness;
    }

    public get wsProvider(): WebsocketProvider | undefined {
        return this._provider;
    }

    public getPageAwareness(pageId: string): Awareness | undefined {
        const pageConn = this.getPageConnection(pageId);
        return pageConn?.awareness;
    }

    public get isContainerConnected(): boolean {
        try {
            // WebsocketProvider has a private flag; infer from wsconnected when available
            const p = this._provider as
                | { wsconnected?: boolean; connected?: boolean; _connected?: boolean; }
                | undefined;
            if (!p) return true; // treat offline as connected for local mode
            return !!(p.wsconnected ?? p.connected ?? p._connected ?? false);
        } catch {
            return true;
        }
    }

    public get connectionState() {
        return this.isContainerConnected ? "Connected" : "Disconnected";
    }

    public getConnectionStateString(): string {
        return this.isContainerConnected ? "接続済み" : "切断";
    }

    // Debug helpers similar to FluidClient
    getAllData() {
        const items = this.project.items as Items;
        const collect = (
            it: Items | { length?: number; at?: (i: number) => unknown; [key: number]: unknown; },
        ): unknown[] => {
            const arr: unknown[] = [];
            const len = (it as { length?: number; })?.length ?? 0;
            for (let i = 0; i < len; i++) {
                const item = (it as { at?: (i: number) => unknown; [key: number]: unknown; }).at?.(i)
                    ?? (it as unknown[])[i];
                if (!item) continue;
                const node: unknown = {
                    id: (item as { id?: string; }).id,
                    text: (item as { text?: { toString?: () => string; }; })?.text?.toString?.() ?? "",
                    author: (item as { author?: unknown; }).author,
                    votes: [...((item as { votes?: unknown[]; })?.votes ?? [])],
                    created: (item as { created?: unknown; }).created,
                    lastChanged: (item as { lastChanged?: unknown; }).lastChanged,
                };
                const children = (item as { items?: Items; })?.items as Items;
                if (children && ((children as { length?: number; }).length ?? 0) > 0) {
                    (node as { items?: unknown[]; }).items = collect(children);
                }
                arr.push(node);
            }
            return arr;
        };
        const result = collect(items);
        return { itemCount: result.length, items: result };
    }

    getTreeAsJson(path?: string) {
        const treeData = this.getAllData();
        if (!path) return treeData;
        const parts = path.split(".");
        let result: unknown = treeData;
        for (const part of parts) {
            if (result === undefined || result === null) return null;
            result = (result as { [key: string]: unknown; })[part];
        }
        return result;
    }

    public async createPage(pageName: string, lines: string[]): Promise<void> {
        const pageItem = (this.project.items as Items).addNode("user");
        yCast<{ insert?: (offset: number, text: string) => void; }>(pageItem.text).insert?.(0, pageName);
        const pageChildren = pageItem.items as Items;
        for (const line of lines) {
            const item = pageChildren.addNode("user");
            yCast<{ insert?: (offset: number, text: string) => void; }>(item.text).insert?.(0, line);
        }
    }

    public dispose() {
        try {
            yCast<{ destroy?: () => void; }>(this._provider)?.destroy?.();
        } catch {}
        try {
            yCast<{ destroy?: () => void; }>(this._doc)?.destroy?.();
        } catch {}
        try {
            presenceStore.getUsers().forEach(u => presenceStore.removeUser(u.userId));
        } catch {}
    }
}
