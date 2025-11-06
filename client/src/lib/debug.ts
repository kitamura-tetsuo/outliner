import { goto } from "$app/navigation";
import type * as Y from "yjs";
import type { YTree } from "yjs-orderedtree";
import { userManager } from "../auth/UserManager";
import * as yjsHighService from "../lib/yjsService.svelte";
import { Items } from "../schema/app-schema";
import type { Item as AppItem } from "../schema/app-schema";
import * as snapshotService from "../services/snapshotService";
import { yjsStore } from "../stores/yjsStore.svelte";
import { getLogger } from "./logger";

const logger = getLogger();

export function setupGlobalDebugFunctions() {
    if (typeof window !== "undefined") {
        // In Playwright tests, avoid exposing goto to prevent navigation loops.
        if (process.env.NODE_ENV !== "test") {
            window.__SVELTE_GOTO__ = async (
                url: string,
                opts?: {
                    replaceState?: boolean;
                    noScroll?: boolean;
                    keepFocus?: boolean;
                    invalidateAll?: boolean;
                    state?: Record<string, unknown>;
                },
            ) => {
                await Promise.resolve();
                return goto(url, opts);
            };
        } else {
            try {
                delete window.__SVELTE_GOTO__;
            } catch {}
        }
        // サービス / ストア / ユーザーマネージャ
        window.__FLUID_SERVICE__ = yjsHighService;
        window.__FLUID_STORE__ = yjsStore; // keep legacy name for helpers
        window.__USER_MANAGER__ = userManager;
        window.__SNAPSHOT_SERVICE__ = snapshotService;
        logger.debug("Global debug functions initialized");
    }
}

declare global {
    interface Window {
        __SVELTE_GOTO__?: (
            url: string,
            opts?: {
                replaceState?: boolean;
                noScroll?: boolean;
                keepFocus?: boolean;
                invalidateAll?: boolean;
                state?: Record<string, unknown>;
            },
        ) => Promise<void>;
        getFluidTreeDebugData?: () => Record<string, unknown>;
        getFluidTreePathData?: (path?: string) => Record<string, unknown>;
        getYjsTreeDebugData?: () => Record<string, unknown>;
        getYjsTreePathData?: (path?: string) => Record<string, unknown>;
        __FLUID_SERVICE__?: typeof yjsHighService;
        __FLUID_STORE__?: typeof yjsStore;
        __USER_MANAGER__?: typeof userManager;
        __SNAPSHOT_SERVICE__?: typeof snapshotService;
    }
}

if (process.env.NODE_ENV === "test") {
    if (typeof window !== "undefined") {
        // Do not expose __SVELTE_GOTO__ in tests to force page.goto in helpers
        try {
            delete window.__SVELTE_GOTO__;
        } catch {}
        window.__FLUID_SERVICE__ = yjsHighService;
        window.__FLUID_STORE__ = yjsStore;
        window.__USER_MANAGER__ = userManager;
        window.__SNAPSHOT_SERVICE__ = snapshotService;

        // SharedTreeのデータ構造を取得するデバッグ関数
        window.getFluidTreeDebugData = function(): Record<string, unknown> {
            if (!yjsStore.yjsClient) {
                throw new Error(
                    "YjsClient is not initialized. Please wait for the client to be ready.",
                );
            }
            return yjsStore.yjsClient.getAllData();
        };

        // 特定のパスのデータを取得するデバッグ関数
        window.getFluidTreePathData = function(path?: string): Record<string, unknown> {
            if (!yjsStore.yjsClient) {
                throw new Error(
                    "YjsClient is not initialized. Please wait for the client to be ready.",
                );
            }
            return yjsStore.yjsClient.getTreeAsJson(path) as Record<string, unknown>;
        };

        // Yjs tree structure debug helpers
        window.getYjsTreeDebugData = function(): Record<string, unknown> {
            type ProjectLike = { ydoc: Y.Doc; tree: YTree; };
            const proj = yjsStore.yjsClient?.project as ProjectLike | undefined;
            if (!proj) {
                throw new Error("FluidClient project not initialized");
            }
            const project = proj;

            type PlainNode = { id: string; text: string; items: PlainNode[]; };

            const toPlain = (item: AppItem): PlainNode => {
                const children = new Items(project.ydoc, project.tree, item.key!);
                return {
                    id: item.id,
                    text: item.text,
                    items: [...children].map(child => toPlain(child)),
                };
            };
            const rootItems = new Items(project.ydoc, project.tree, "root");
            return {
                itemCount: rootItems.length,
                items: [...rootItems].map(item => toPlain(item)),
            } as Record<string, unknown>;
        };

        window.getYjsTreePathData = function(path?: string): Record<string, unknown> {
            const data = window.getYjsTreeDebugData?.();
            if (!path) return data ?? {};
            const getByPath = (value: unknown, p: string): unknown => {
                return p.split(".").reduce<unknown>((prev, curr) => {
                    if (prev === undefined || prev === null) return prev;
                    if (Array.isArray(prev)) {
                        const idx = Number(curr);
                        return Number.isFinite(idx) ? prev[idx] : undefined;
                    }
                    if (typeof prev === "object") {
                        return (prev as Record<string, unknown>)[curr];
                    }
                    return undefined;
                }, value);
            };
            return getByPath(data, path) as Record<string, unknown>;
        };

        logger.debug("Global debug functions initialized");
    }
}
