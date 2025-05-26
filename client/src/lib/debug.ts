/**
 * デバッグ用のユーティリティ関数
 * 開発環境でのみ使用する
 */

import { getLogger } from "./logger";
import { goto } from "$app/navigation";
import * as fluidService from "../lib/fluidService";
import { fluidStore } from "../stores/fluidStore.svelte";

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
    (window as any).__SVELTE_GOTO__ = goto;

    // SharedTreeのデータ構造を取得するデバッグ関数
    window.getFluidTreeDebugData = function () {
        return fluidStore.fluidClient!.getAllData();
    };

    // 特定のパスのデータを取得するデバッグ関数
    window.getFluidTreePathData = function (path?: string) {
        return fluidStore.fluidClient!.getTreeAsJson(path);
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
    }
}
