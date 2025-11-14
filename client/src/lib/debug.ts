import { goto } from "$app/navigation";
import { userManager } from "../auth/UserManager";
import * as yjsHighService from "../lib/yjsService.svelte";
import { Items } from "../schema/app-schema";
import * as snapshotService from "../services/snapshotService";
import { yjsStore } from "../stores/yjsStore.svelte";
import { getLogger } from "./logger";

const logger = getLogger();

export function setupGlobalDebugFunctions() {
    if (typeof window !== "undefined") {
        const debugWindow = window as unknown as Window & Record<string, unknown>;

        // In Playwright tests, avoid exposing goto to prevent navigation loops.
        if (process.env.NODE_ENV !== "test") {
            debugWindow.__SVELTE_GOTO__ = async (
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
                delete debugWindow.__SVELTE_GOTO__;
            } catch {}
        }
        // サービス / ストア / ユーザーマネージャ
        debugWindow.__FLUID_SERVICE__ = yjsHighService;
        debugWindow.__FLUID_STORE__ = yjsStore; // keep legacy name for helpers
        debugWindow.__USER_MANAGER__ = userManager;
        debugWindow.__SNAPSHOT_SERVICE__ = snapshotService;
        logger.debug("Global debug functions initialized");
    }
}

declare global {
    interface Window {
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
        const debugWindow = window as unknown as Window & Record<string, unknown>;
        // Do not expose __SVELTE_GOTO__ in tests to force page.goto in helpers
        try {
            delete debugWindow.__SVELTE_GOTO__;
        } catch {}
        debugWindow.__FLUID_SERVICE__ = yjsHighService;
        debugWindow.__FLUID_STORE__ = yjsStore;
        debugWindow.__USER_MANAGER__ = userManager;
        debugWindow.__SNAPSHOT_SERVICE__ = snapshotService;

        // SharedTreeのデータ構造を取得するデバッグ関数
        window.getFluidTreeDebugData = function(): Record<string, unknown> {
            if (!yjsStore.yjsClient) {
                throw new Error(
                    "YjsClient is not initialized. Please wait for the client to be ready.",
                );
            }
            const data = (yjsStore.yjsClient as { getAllData: () => unknown; }).getAllData();
            return (data ?? {}) as Record<string, unknown>;
        };

        // 特定のパスのデータを取得するデバッグ関数
        window.getFluidTreePathData = function(path?: string): Record<string, unknown> {
            if (!yjsStore.yjsClient) {
                throw new Error(
                    "YjsClient is not initialized. Please wait for the client to be ready.",
                );
            }
            const data = (yjsStore.yjsClient as { getTreeAsJson: (path?: string) => unknown; }).getTreeAsJson(path);
            return (data ?? {}) as Record<string, unknown>;
        };

        // Yjs tree structure debug helpers
        window.getYjsTreeDebugData = function() {
            const fc = yjsStore.yjsClient as { project?: { ydoc: unknown; tree: unknown; items: unknown; }; };
            if (!fc?.project) {
                throw new Error("FluidClient project not initialized");
            }
            const project = fc.project;
            const toPlain = (
                item: { id: string; text?: { toString: () => string; }; key: string; },
            ): { id: string; text: string; items: unknown[]; } => {
                const children = new Items(project.ydoc as any, project.tree as any, item.key);
                return {
                    id: item.id,
                    text: item.text?.toString() ?? "",
                    items: [...children].map(child => toPlain(child as any)),
                };
            };
            const rootItems = project.items as Items;
            return {
                itemCount: rootItems.length,
                items: [...rootItems].map(item => toPlain(item as any)),
            };
        };

        window.getYjsTreePathData = function(path?: string): Record<string, unknown> {
            const data = window.getYjsTreeDebugData?.() ?? {};
            if (!path) return data as Record<string, unknown>;
            const result = path.split(".").reduce(
                (prev: unknown, curr: string) => (prev && typeof prev === "object" ? (prev as any)[curr] : undefined),
                data,
            );
            return (result ?? {}) as Record<string, unknown>;
        };

        logger.debug("Global debug functions initialized");
    }
}
