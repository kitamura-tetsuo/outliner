/**
 * デバッグ用のユーティリティ関数
 * 開発環境でのみ使用する
 */

import { goto } from "$app/navigation";
import { userManager } from "../auth/UserManager";
import * as fluidService from "../lib/fluidService.svelte";
import { YjsProjectManager } from "../lib/yjsProjectManager.svelte";
import { yjsService } from "../lib/yjsService.svelte";
import * as snapshotService from "../services/snapshotService";
import { fluidStore } from "../stores/fluidStore.svelte";
import { getLogger } from "./logger";
import * as snapshotExporter from "./snapshotExport";

const logger = getLogger();

/**
 * グローバルデバッグ関数を設定する（Yjsブランチ専用）
 */
export function setupGlobalDebugFunctions() {
    // Yjsブランチ: グローバル変数を明示的に設定
    if (typeof window !== "undefined") {
        (window as any).__SVELTE_GOTO__ = goto;
        (window as any).__FLUID_SERVICE__ = fluidService;
        (window as any).__FLUID_STORE__ = fluidStore;
        (window as any).__USER_MANAGER__ = userManager;
        (window as any).__SNAPSHOT_SERVICE__ = snapshotService;
        (window as any).yjsService = yjsService;
        (window as any).YjsProjectManager = YjsProjectManager;
        (window as any).__SNAPSHOT_EXPORTER__ = snapshotExporter;

        logger.debug("setupGlobalDebugFunctions: Global variables set");
    }
}

// グローバル型定義を拡張
declare global {
    interface Window {
        getFluidTreeDebugData?: () => any;
        getFluidTreePathData?: (path?: string) => any;
        __FLUID_SERVICE__?: typeof fluidService;
        __FLUID_STORE__?: typeof fluidStore;
        __USER_MANAGER__?: typeof userManager;
        __SNAPSHOT_SERVICE__?: typeof snapshotService;
        yjsService?: typeof yjsService;
        YjsProjectManager?: typeof YjsProjectManager;
    }
}

// Yjsブランチ: テスト環境の条件を緩和（常にグローバル変数を設定）
if (typeof window !== "undefined") {
    // グローバルオブジェクトにサービスを保存
    (window as any).__SVELTE_GOTO__ = goto;
    (window as any).__FLUID_SERVICE__ = fluidService;
    (window as any).__FLUID_STORE__ = fluidStore;
    (window as any).__USER_MANAGER__ = userManager;
    (window as any).__SNAPSHOT_SERVICE__ = snapshotService;
    (window as any).yjsService = yjsService;
    (window as any).YjsProjectManager = YjsProjectManager;
    (window as any).__SNAPSHOT_EXPORTER__ = snapshotExporter;
    // Yjsモードでは簡易デバッグ関数を提供
    window.getFluidTreeDebugData = function() {
        console.log("Yjs mode: Fluid debug data not available");
        return { message: "Yjs mode: Fluid debug data not available" };
    };

    // 特定のパスのデータを取得するデバッグ関数
    window.getFluidTreePathData = function(path?: string) {
        console.log("Yjs mode: Fluid path data not available");
        return { message: "Yjs mode: Fluid path data not available", path };
    };

    logger.debug("Global debug functions initialized");
}
