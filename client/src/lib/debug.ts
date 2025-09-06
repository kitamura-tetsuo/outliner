/**
 * デバッグ用のユーティリティ関数
 * 開発環境でのみ使用する
 */

import { goto } from "$app/navigation";
import { userManager } from "../auth/UserManager";
import * as fluidService from "../lib/fluidService.svelte";
import { Items } from "../schema/app-schema";
import * as snapshotService from "../services/snapshotService";
import { fluidStore } from "../stores/fluidStore.svelte";
import { getLogger } from "./logger";

const logger = getLogger();

/**
 * グローバルデバッグ関数を設定する
 * @param fluidClient FluidClientインスタンス
 */
export function setupGlobalDebugFunctions(service?: any) {
    if (typeof window !== "undefined") {
        // In Playwright tests, avoid exposing goto to prevent navigation loops.
        if (process.env.NODE_ENV !== "test") {
            (window as any).__SVELTE_GOTO__ = async (url: string, opts?: any) => {
                await Promise.resolve();
                return goto(url, opts);
            };
        } else {
            try {
                delete (window as any).__SVELTE_GOTO__;
            } catch {}
        }
        // サービス / ストア / ユーザーマネージャ
        (window as any).__FLUID_SERVICE__ = service ?? fluidService;
        (window as any).__FLUID_STORE__ = fluidStore;
        (window as any).__USER_MANAGER__ = userManager;
        (window as any).__SNAPSHOT_SERVICE__ = snapshotService;
        logger.debug("Global debug functions initialized");
    }
}

// グローバル型定義を拡張
declare global {
    interface Window {
        getFluidTreeDebugData?: () => any;
        getFluidTreePathData?: (path?: string) => any;
        getYjsTreeDebugData?: () => any;
        getYjsTreePathData?: (path?: string) => any;
        __FLUID_SERVICE__?: typeof fluidService;
        __FLUID_STORE__?: typeof fluidStore;
        __USER_MANAGER__?: typeof userManager;
        __SNAPSHOT_SERVICE__?: typeof snapshotService;
    }
}

if (process.env.NODE_ENV === "test") {
    if (typeof window !== "undefined") {
        // Do not expose __SVELTE_GOTO__ in tests to force page.goto in helpers
        try {
            delete (window as any).__SVELTE_GOTO__;
        } catch {}
        (window as any).__FLUID_SERVICE__ = fluidService;
        (window as any).__FLUID_STORE__ = fluidStore;
        (window as any).__USER_MANAGER__ = userManager;
        (window as any).__SNAPSHOT_SERVICE__ = snapshotService;

        // SharedTreeのデータ構造を取得するデバッグ関数
        window.getFluidTreeDebugData = function() {
            if (!fluidStore.fluidClient) {
                throw new Error(
                    "FluidClient is not initialized. Please wait for the client to be ready.",
                );
            }
            return fluidStore.fluidClient.getAllData();
        };

        // 特定のパスのデータを取得するデバッグ関数
        window.getFluidTreePathData = function(path?: string) {
            if (!fluidStore.fluidClient) {
                throw new Error(
                    "FluidClient is not initialized. Please wait for the client to be ready.",
                );
            }
            return fluidStore.fluidClient.getTreeAsJson(path);
        };

        // Yjs tree structure debug helpers
        window.getYjsTreeDebugData = function() {
            const fc = fluidStore.fluidClient;
            if (!fc?.project) {
                throw new Error("FluidClient project not initialized");
            }
            const project = fc.project;
            const toPlain = (item: any): any => {
                const children = new Items(project.ydoc, project.tree, item.key);
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
            const data = window.getYjsTreeDebugData();
            if (!path) return data;
            return path.split(".").reduce((prev: any, curr: string) => prev?.[curr], data);
        };

        logger.debug("Global debug functions initialized");
    }
}
