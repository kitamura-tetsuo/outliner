// Yjs-based client class providing a FluidClient-like surface
// @ts-nocheck
import type { Awareness } from "y-protocols/awareness";
import type { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

import { getLogger } from "../lib/logger";
import { createProjectConnection } from "../lib/yjs/connection";
import { yjsService } from "../lib/yjs/service";
import { Items, Project } from "../schema/yjs-schema";
import { presenceStore } from "../stores/PresenceStore.svelte";

const logger = getLogger();

export interface YjsClientParams {
    clientId: string;
    projectId: string;
    project: Project;
    doc?: Y.Doc;
    provider?: WebsocketProvider;
    awareness?: Awareness;
}

export class YjsClient {
    public readonly clientId: string;
    public readonly containerId: string; // keep name parity with FluidClient usages
    public readonly project: Project;

    private _doc?: Y.Doc;
    private _provider?: WebsocketProvider;
    private _awareness?: Awareness;

    constructor(params: YjsClientParams) {
        this.clientId = params.clientId;
        this.containerId = params.projectId; // mapped name
        this.project = params.project;
        this._doc = params.doc;
        this._provider = params.provider;
        this._awareness = params.awareness;

        // Attach presence binding when awareness exists
        try {
            if (this._awareness) {
                yjsService.bindProjectPresence(this._awareness);
            }
        } catch {}
    }

    // Build a client with active provider/awareness
    static async connect(projectId: string, project: Project): Promise<YjsClient> {
        const { doc, provider, awareness, dispose } = await createProjectConnection(projectId);
        // Replace project's internal Doc with the connected one if needed
        try {
            if ((project as any).ydoc && (project as any).ydoc !== doc) {
                // No strict coupling required; yjs-schema consumers use project.ydoc
                (project as any).ydoc = doc;
            }
        } catch {}
        const clientId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        return new YjsClient({ clientId, projectId, project, doc, provider, awareness });
    }

    // Surface compatible with FluidClient
    public getProject() {
        return this.project;
    }

    public getTree() {
        return this.project.items as Items;
    }

    public get isContainerConnected(): boolean {
        try {
            // WebsocketProvider has a private flag; infer from wsconnected when available
            const p: any = this._provider;
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
        const collect = (it: Items | any): any => {
            const arr: any[] = [];
            const len = (it as any).length ?? 0;
            for (let i = 0; i < len; i++) {
                const item = (it as any).at ? (it as any).at(i) : (it as any)[i];
                if (!item) continue;
                const node: any = {
                    id: item.id,
                    text: item.text?.toString?.() ?? "",
                    author: (item as any).author,
                    votes: [...((item as any).votes ?? [])],
                    created: (item as any).created,
                    lastChanged: (item as any).lastChanged,
                };
                const children = item.items as Items;
                if (children && ((children as any).length ?? 0) > 0) {
                    node.items = collect(children);
                }
                arr.push(node);
            }
            return { itemCount: arr.length, items: arr };
        };
        return collect(items);
    }

    getTreeAsJson(path?: string) {
        const treeData = this.getAllData();
        if (!path) return treeData;
        const parts = path.split(".");
        let result: any = treeData;
        for (const part of parts) {
            if (result === undefined || result === null) return null;
            result = result[part];
        }
        return result;
    }

    public async createPage(pageName: string, lines: string[]): Promise<void> {
        const pageItem = (this.project.items as Items).addNode("user");
        (pageItem.text as any).insert?.(0, pageName);
        const pageChildren = pageItem.items as Items;
        for (const line of lines) {
            const item = pageChildren.addNode("user");
            (item.text as any).insert?.(0, line);
        }
    }

    public dispose() {
        try {
            (this._provider as any)?.destroy?.();
        } catch {}
        try {
            (this._doc as any)?.destroy?.();
        } catch {}
        try {
            presenceStore.getUsers().forEach(u => presenceStore.removeUser(u.userId));
        } catch {}
    }
}
