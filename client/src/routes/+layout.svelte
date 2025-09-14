<script lang="ts">
import { browser } from "$app/environment";
import { getEnv } from "$lib/env";
import { page } from "$app/stores";
import { getLogger } from "$lib/logger";
import { store as appStore } from "../stores/store.svelte";
import { Project } from "../schema/app-schema";
import {
    onDestroy,
    onMount,
} from "svelte";
import "../app.css";
// Import from $lib/index.ts to ensure fetch override is loaded
import "$lib";
// Defer user/auth-related imports to client to avoid SSR crashes
import { setupGlobalDebugFunctions } from "../lib/debug";
import "../utils/ScrapboxFormatter";
// グローバルに公開するためにインポート
import Toolbar from "../components/Toolbar.svelte";
// Defer services import; it depends on UserManager
import { userPreferencesStore } from "../stores/UserPreferencesStore.svelte";


// Load test data helper globally in test environments so E2E can seed data on any route
if (browser && (
    import.meta.env.MODE === "test" ||
    import.meta.env.VITE_IS_TEST === "true" ||
    process.env.NODE_ENV === "test"
)) {
    import("../tests/utils/testDataHelper").then(() => {
        console.log("Test data helper loaded (layout)");
    }).catch(err => {
        console.error("Failed to load test data helper in layout:", err);
    });
}

let { children } = $props();
const logger = getLogger("AppLayout");

// 認証関連の状態
let isAuthenticated = $state(false);
let error: string | undefined = $state(undefined);

// グローバルへのフォールバック公開（早期に window.generalStore を満たす）
if (browser) {
    (window as any).generalStore = (window as any).generalStore || appStore;
    (window as any).appStore = (window as any).appStore || appStore;
}
// URL からプロジェクト/ページを初期化して window.generalStore.project と currentPage を満たす
if (browser) {
    try {
        const parts = window.location.pathname.split("/").filter(Boolean);
        const projectTitle = decodeURIComponent(parts[0] || "Untitled Project");
        const pageTitle = decodeURIComponent(parts[1] || "");

        if (!(appStore as any).project) {
            (appStore as any).project = (Project as any).createInstance(projectTitle);
            console.log("INIT: Provisional Project set in +layout.svelte", { projectTitle, pageTitle });
        }

        // currentPage が未設定で、URL に pageTitle がある場合は準備
        if (pageTitle && !(appStore as any).currentPage && (appStore as any).project) {
            try {
                const itemsAny: any = (appStore as any).project.items;
                // 既存ページにタイトル一致があるかチェック
                let found: any = null;
                const len = itemsAny?.length ?? 0;
                for (let i = 0; i < len; i++) {
                    const p = itemsAny.at ? itemsAny.at(i) : itemsAny[i];
                    const t = p?.text?.toString?.() ?? String(p?.text ?? "");
                    if (String(t).toLowerCase() === String(pageTitle).toLowerCase()) { found = p; break; }
                }
                if (!found) {
                    found = itemsAny?.addNode?.("tester");
                    found?.updateText?.(pageTitle);
                }
                if (found) (appStore as any).currentPage = found;
            } catch {}
        }
    } catch {}
}

// ルート変化を購読して currentPage を補完（runes準拠）
function ensureCurrentPageByRoute(pj: string, pg: string) {
    try {
        if (!browser || !pg) return;
        const gs: any = appStore;
        if (!gs?.project) return;
        const items: any = gs.project.items;
        let found: any = null;
        const len = items?.length ?? 0;
        for (let i = 0; i < len; i++) {
            const p = items.at ? items.at(i) : items[i];
            const t = p?.text?.toString?.() ?? String(p?.text ?? "");
            if (String(t).toLowerCase() === String(pg).toLowerCase()) { found = p; break; }
        }
        if (!found) {
            found = items?.addNode?.("tester");
            found?.updateText?.(pg);
        }
        if (found) gs.currentPage = found;
    } catch {}
}



let currentTheme = $derived(userPreferencesStore.theme);

// APIサーバーのURLを取得
const API_URL = getEnv("VITE_API_SERVER_URL", "http://localhost:7071");

/**
 * ログファイルをローテーションする関数
 */
async function rotateLogFiles() {
    try {
        if (import.meta.env.DEV) {
            logger.info(
                "アプリケーション終了時のログローテーションを実行します",
            );
        }

        // 1. まず通常のFetch APIで試す
        try {
            const response = await fetch(`${API_URL}/api/rotate-logs`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({}),
            });

            if (response.ok) {
                const result = await response.json();
                if (import.meta.env.DEV) {
                    logger.info("ログローテーション完了", result);
                }
                return;
            }
        }
        catch (fetchError) {
            // fetch失敗時はsendBeaconを試す - エラーは記録しない
            if (import.meta.env.DEV) {
                logger.debug(
                    "通常のfetch呼び出しに失敗、sendBeaconを試行します",
                );
            }
        }

        // 2. フォールバックとしてsendBeaconを使用
        const blob = new Blob([JSON.stringify({})], {
            type: "application/json",
        });
        const success = navigator.sendBeacon(
            `${API_URL}/api/rotate-logs`,
            blob,
        );

        if (success) {
            if (import.meta.env.DEV) {
                logger.info("ログローテーション実行をスケジュールしました");
            }
        }
        else {
            logger.warn("ログローテーション送信失敗");

            // 3. さらに再試行としてケーキング用のクロージングリクエストを試す
            try {
                const img = new Image();
                img.src = `${API_URL}/api/rotate-logs?t=${Date.now()}`;
            }
            catch (imgError) {
                // 最後の試行なのでエラーは無視
            }
        }
    }
    catch (error) {
        logger.error("ログローテーション中にエラーが発生しました", {
            error,
        });
    }
}

/**
 * 定期的にログローテーションを実行する関数（予防策）
 */
function schedulePeriodicLogRotation() {
    // 定期的なログローテーション（12時間ごと）
    const ROTATION_INTERVAL = 12 * 60 * 60 * 1000;

    return setInterval(() => {
        if (import.meta.env.DEV) {
            logger.info("定期的なログローテーションを実行します");
        }
        rotateLogFiles();
    }, ROTATION_INTERVAL);
}

let rotationInterval: ReturnType<typeof setInterval> | undefined = undefined;

// ブラウザのunloadイベント用リスナー
function handleBeforeUnload() {
    // ブラウザ終了時にログローテーションを実行
    rotateLogFiles();
}

// 別の呼び出し方法としてvisibilitychangeイベントを使用
function handleVisibilityChange() {
    if (document.visibilityState === "hidden") {
        // ユーザーがページを離れる際にもログローテーションを試行
        rotateLogFiles();
    }
}

// アプリケーション初期化時の処理
onMount(async () => {
    // ブラウザ環境でのみ実行
    if (browser) {
        // E2E: Hydration detection flag for stable waits
        try {
            (window as any).__E2E_LAYOUT_MOUNTED__ = true;
            document.dispatchEvent(new Event("E2E_LAYOUT_MOUNTED"));
        } catch {}
        // Dynamically import browser-only modules
        let userManager: any;
        let yjsService: any;
        let services: any;
        try {
            ({ userManager } = await import("../auth/UserManager"));
            yjsService = await import("../lib/yjsService.svelte");
            services = await import("../services");
        } catch (e) {
            logger.error("Failed to load client-only modules", e);
        }
        // アプリケーション初期化のログ
        if (import.meta.env.DEV) {
            logger.info("アプリケーションがマウントされました");
        }
        // ルート変化に追従（currentPage補完）
        try {
            const unsub = page.subscribe(($p) => ensureCurrentPageByRoute($p.params.project ?? "", $p.params.page ?? ""));
            onDestroy(unsub);
        } catch {}

        // Service WorkerはE2Eテストでは無効化して、ナビゲーションやページクローズ干渉を防ぐ
        const isE2e = (
            import.meta.env.MODE === "test"
            || import.meta.env.VITE_IS_TEST === "true"
            || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
        );
        if (!isE2e && "serviceWorker" in navigator) {
            navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
                .then(reg => {
                    if (import.meta.env.DEV) logger.info("Service worker registered successfully");
                    if ("sync" in reg) {
                        (reg as any).sync.register("sync-ops").catch((err: any) => {
                            logger.warn("Failed to register background sync:", err);
                        });
                    }
                    reg.addEventListener("updatefound", () => {
                        if (import.meta.env.DEV) logger.info("Service worker update found");
                    });
                })
                .catch(err => { logger.error("Service worker registration failed:", err); });
        }

        // 認証状態を確認
        isAuthenticated = userManager?.getCurrentUser() !== null;

        if (isAuthenticated) {
            // デバッグ関数を初期化
            setupGlobalDebugFunctions(yjsService?.yjsHighService);
        }
        else {
            // 認証状態の変更を監視
            userManager?.addEventListener((authResult: any) => {
                isAuthenticated = authResult !== null;
                if (isAuthenticated && browser) {
                    setupGlobalDebugFunctions(yjsService?.yjsHighService);
                    const isTestEnv = import.meta.env.MODE === "test" ||
                        process.env.NODE_ENV === "test" ||
                        import.meta.env.VITE_IS_TEST === "true";
                    if (isTestEnv) {
                        // テストデータ自動投入をスキップするフラグ
                        const skipSeed = window.localStorage.getItem("SKIP_TEST_CONTAINER_SEED") === "true";
                        if (!skipSeed) {
                            // テスト環境では、既存のコンテナを削除してからテスト用のコンテナを作成する
                            (async () => {
                                try {
                                    // 新しいテスト用コンテナを作成
                                    const pageName = "test-page";
                                    const lines = [
                                        "これはテスト用のページです。1",
                                        "これはテスト用のページです。2",
                                        "内部リンクのテスト: [test-link]",
                                    ];
                                    (await yjsService.createNewProject("test-1")).createPage(pageName, lines);
                                    (await yjsService.createNewProject("test-2")).createPage(pageName, lines);
                                }
                                catch (error) {
                                    logger.error(
                                        "テスト環境のコンテナ準備中にエラーが発生しました",
                                        error,
                                    );
                                }
                            })();
                        } else {
                            if (import.meta.env.DEV) {
                                logger.info("SKIP_TEST_CONTAINER_SEED=true のため、テスト用コンテナの自動生成をスキップします");
                            }
                        }
                    }
                }
            });
        }

        // Yjs: no auth-coupled init hook required

        // E2E ではページ遷移に干渉しないようにクリーンアップ系のリスナーを無効化
        const isE2eCleanup = (
            import.meta.env.MODE === "test"
            || import.meta.env.VITE_IS_TEST === "true"
            || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
        );
        if (!isE2eCleanup) {
            // ブラウザ終了時のイベントリスナーを登録
            window.addEventListener("beforeunload", handleBeforeUnload);
            // visibilitychangeイベントリスナーを登録（追加の保険）
            document.addEventListener("visibilitychange", handleVisibilityChange);
            // 定期的なログローテーションを設定
            rotationInterval = schedulePeriodicLogRotation();
        }
    }
});

// コンポーネント破棄時の処理
onDestroy(async () => {
    // ブラウザ環境でのみ実行
    if (browser) {
        // イベントリスナーを削除
        window.removeEventListener("beforeunload", handleBeforeUnload);
        document.removeEventListener(
            "visibilitychange",
            handleVisibilityChange,
        );
        try {
            const { cleanupYjsClient } = await import("../services");
            cleanupYjsClient();
        } catch {}

        // 定期的なログローテーションの解除
        if (rotationInterval) {
            clearInterval(rotationInterval);
        }
    }
});
</script>

<div data-testid="outliner-base">
    <!-- Global main toolbar with SearchBox (SEA-0001) -->
    <Toolbar />

    <!-- Ensure content is not hidden behind fixed toolbar -->
    <div class="main-content">
        {@render children()}
    </div>


    <button
        class="fixed bottom-4 right-4 p-2 rounded bg-gray-200 dark:bg-gray-700"
        onclick={() => userPreferencesStore.toggleTheme()}
    >
        {currentTheme === "light" ? "Dark Mode" : "Light Mode"}
    </button>
</div>

<style>
/* Keep content clear of the fixed Toolbar (height ~4rem) */
.main-content { padding-top: 5rem; }
</style>
