/**
 * デバッグ用のユーティリティ関数
 * 開発環境でのみ使用する
 */

import { goto } from "$app/navigation";
import { userManager } from "../auth/UserManager";
import * as fluidService from "../lib/fluidService.svelte";
import { getCurrentContainerId } from "../lib/fluidService.svelte";
import * as snapshotService from "../services/snapshotService";
import { fluidStore } from "../stores/fluidStore.svelte";
import { getLogger } from "./logger";

const logger = getLogger();

/**
 * グローバルデバッグ関数を設定する
 * @param fluidClient FluidClientインスタンス
 */
export function setupGlobalDebugFunctions(xfluidService: any) {
    if (typeof window === "undefined") return;

    // グローバルオブジェクトにFluidClientインスタンスを保存
    (window as any).__FLUID_SERVICE__ = fluidService;
    (window as any).__FLUID_STORE__ = fluidStore;
    (window as any).__USER_MANAGER__ = userManager;
    (window as any).__SNAPSHOT_SERVICE__ = snapshotService;
    (window as any).__SVELTE_GOTO__ = goto;

    // firestoreStoreを動的にimportしてグローバルに追加
    import("../stores/firestoreStore.svelte").then(module => {
        (window as any).__FIRESTORE_STORE__ = module.firestoreStore;
    });

    // 添付ファイル機能で使用する関数をグローバルに追加
    (window as any).getCurrentContainerId = getCurrentContainerId;

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
    logger.debug("Global debug functions initialized");
}

// グローバル型定義を拡張
declare global {
    interface Window {
        getFluidTreeDebugData?: () => any;
        getFluidTreePathData?: (path?: string) => any;
        __FLUID_SERVICE__?: any;
        __FLUID_STORE__?: any;
        __USER_MANAGER__?: any;
        __SNAPSHOT_SERVICE__?: any;
    }
}
