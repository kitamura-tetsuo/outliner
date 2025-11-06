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
        // In Playwright tests, avoid exposing goto to prevent navigation loops.
        if (process.env.NODE_ENV !== "test") {
            (window as Window & Record<string, unknown>).__SVELTE_GOTO__ = async (
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
                delete (window as Window & Record<string, unknown>).__SVELTE_GOTO__;
            } catch {}
        }
        // サービス / ストア / ユーザーマネージャ
        (window as Window & Record<string, unknown>).__FLUID_SERVICE__ = yjsHighService;
        (window as Window & Record<string, unknown>).__FLUID_STORE__ = yjsStore; // keep legacy name for helpers
        (window as Window & Record<string, unknown>).__USER_MANAGER__ = userManager;
        (window as Window & Record<string, unknown>).__SNAPSHOT_SERVICE__ = snapshotService;
        logger.debug("Global debug functions initialized");
    }
}

declare global {
    interface Window {
        getFluidTreeDebugData?: () => unknown;
        getFluidTreePathData?: (path?: string) => unknown;
        getYjsTreeDebugData?: () => unknown;
        getYjsTreePathData?: (path?: string) => unknown;
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
            delete (window as Window & Record<string, unknown>).__SVELTE_GOTO__;
        } catch {}
        (window as Window & Record<string, unknown>).__FLUID_SERVICE__ = yjsHighService;
        (window as Window & Record<string, unknown>).__FLUID_STORE__ = yjsStore;
        (window as Window & Record<string, unknown>).__USER_MANAGER__ = userManager;
        (window as Window & Record<string, unknown>).__SNAPSHOT_SERVICE__ = snapshotService;

        // SharedTreeのデータ構造を取得するデバッグ関数
        window.getFluidTreeDebugData = function() {
            if (!yjsStore.yjsClient) {
                throw new Error(
                    "YjsClient is not initialized. Please wait for the client to be ready.",
                );
            }
            return (yjsStore.yjsClient as { getAllData: () => unknown; }).getAllData();
        };

        // 特定のパスのデータを取得するデバッグ関数
        window.getFluidTreePathData = function(path?: string) {
            if (!yjsStore.yjsClient) {
                throw new Error(
                    "YjsClient is not initialized. Please wait for the client to be ready.",
                );
            }
            return (yjsStore.yjsClient as { getTreeAsJson: (path?: string) => unknown; }).getTreeAsJson(path);
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
                const children = new Items(
                    project.ydoc as unknown as import("yjs").Doc,
                    project.tree as unknown as unknown,
                    item.key,
                );
                return {
                    id: item.id,
                    text: item.text?.toString() ?? "",
                    items: [...children].map(child => toPlain(child)),
                };
            };
            const rootItems = project.items as Items;
            return {
                itemCount: rootItems.length,
                items: [...rootItems].map(item => toPlain(item)),
            };
        };

        window.getYjsTreePathData = function(path?: string) {
            const data = window.getYjsTreeDebugData?.();
            if (!path) return data;
            return path.split(".").reduce((prev: unknown, curr: string) => prev?.[curr as keyof typeof prev], data);
        };

        logger.debug("Global debug functions initialized");
    }
}
