/**
 * デバッグ用のユーティリティ関数
 * 開発環境でのみ使用する
 */

import { getLogger } from "./logger";

const logger = getLogger();

/**
 * グローバルデバッグ関数を設定する
 * @param fluidClient FluidClientインスタンス
 */
export function setupGlobalDebugFunctions(fluidClient: any) {
    if (typeof window === "undefined") return;

    // グローバルオブジェクトにFluidClientインスタンスを保存
    (window as any).__FLUID_CLIENT__ = fluidClient;

    // SharedTreeのデータ構造を取得するデバッグ関数
    window.getFluidTreeDebugData = function() {
        if (!fluidClient) {
            logger.error("FluidClient instance not available");
            return { error: "FluidClient instance not available" };
        }

        try {
            return fluidClient.getAllData();
        } catch (error) {
            logger.error("Error getting tree data:", error);
            return { error: (error as Error).message || "Unknown error" };
        }
    };

    // 特定のパスのデータを取得するデバッグ関数
    window.getFluidTreePathData = function(path?: string) {
        if (!fluidClient) {
            return { error: "FluidClient instance not available" };
        }

        try {
            return fluidClient.getTreeAsJson(path);
        } catch (error) {
            return { error: (error as Error).message || "Unknown error" };
        }
    };

    logger.debug("Global debug functions initialized");
}

// グローバル型定義を拡張
declare global {
    interface Window {
        getFluidTreeDebugData?: () => any;
        getFluidTreePathData?: (path?: string) => any;
        __FLUID_CLIENT__?: any;
    }
}
