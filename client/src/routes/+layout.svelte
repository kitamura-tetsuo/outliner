<script lang="ts">
import { browser } from "$app/environment";
import { getEnv } from "$lib/env";
import { getLogger } from "$lib/logger";
import {
    onDestroy,
    onMount,
} from "svelte";
import "../app.css";
// Import from $lib/index.ts to ensure fetch override is loaded
import "$lib";
// Defer user/auth-related imports to client to avoid SSR crashes
import { setupGlobalDebugFunctions } from "../lib/debug";
// Defer fluidService as well (it imports UserManager)
import "../utils/ScrapboxFormatter";
// グローバルに公開するためにインポート
import MobileActionToolbar from "../components/MobileActionToolbar.svelte";
import Toolbar from "../components/Toolbar.svelte";
// Defer services import; it re-exports fluidService which depends on UserManager
import { userPreferencesStore } from "../stores/UserPreferencesStore.svelte";

let { children } = $props();
const logger = getLogger("AppLayout");

// 認証関連の状態
let isAuthenticated = $state(false);
let error: string | undefined = $state(undefined);

let currentTheme = $derived(userPreferencesStore.theme);
$effect(() => {
    if (browser) {
        document.documentElement.classList.toggle(
            "dark",
            currentTheme === "dark",
        );
    }
});

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
        // Dynamically import browser-only modules
        let userManager: any;
        let fluidService: any;
        let services: any;
        try {
            ({ userManager } = await import("../auth/UserManager"));
            fluidService = await import("../lib/fluidService.svelte");
            services = await import("../services");
        } catch (e) {
            logger.error("Failed to load client-only modules", e);
        }
        // アプリケーション初期化のログ
        if (import.meta.env.DEV) {
            logger.info("アプリケーションがマウントされました");
        }
        // Service Workerの登録（プロダクション環境では無効化）
        if (import.meta.env.MODE !== "production" && "serviceWorker" in navigator) {
            // SvelteKitのService Workerを登録
            navigator.serviceWorker.register("/service-worker.js", {
                scope: "/",
            }).then(reg => {
                if (import.meta.env.DEV) {
                    logger.info("Service worker registered successfully");
                }

                // Background Syncが利用可能な場合は登録
                if ("sync" in reg) {
                    (reg as any).sync.register("sync-ops").catch((err: any) => {
                        logger.warn("Failed to register background sync:", err);
                    });
                }

                // Service Workerの更新をチェック
                reg.addEventListener("updatefound", () => {
                    if (import.meta.env.DEV) {
                        logger.info("Service worker update found");
                    }
                });
            }).catch(err => {
                logger.error("Service worker registration failed:", err);
            });
        }

        // 認証状態を確認
        isAuthenticated = userManager?.getCurrentUser() !== null;

        if (isAuthenticated) {
            // デバッグ関数を初期化
            setupGlobalDebugFunctions(fluidService);
        }
        else {
            // 認証状態の変更を監視
            userManager?.addEventListener((authResult: any) => {
                isAuthenticated = authResult !== null;
                // デバッグ関数を初期化
                if (isAuthenticated && browser) {
                    setupGlobalDebugFunctions(fluidService);
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
                                    // ユーザーのコンテナリストを取得
                                    const { containers } = await fluidService.getUserContainers();

                                    // 既存のコンテナを削除
                                    for (const containerId of containers) {
                                        try {
                                            if (import.meta.env.DEV) {
                                                logger.info(
                                                    `テスト環境のため、コンテナを削除します: ${containerId}`,
                                                );
                                            }
                                            const success = await fluidService.deleteContainer(
                                                containerId,
                                            );

                                            if (success) {
                                                if (import.meta.env.DEV) {
                                                    logger.info(
                                                        `コンテナを削除しました: ${containerId}`,
                                                    );
                                                }
                                            }
                                            else {
                                                if (import.meta.env.DEV) {
                                                    logger.warn(
                                                        `コンテナの削除に失敗しました: ${containerId}`,
                                                    );
                                                }
                                            }
                                        }
                                        catch (error) {
                                            logger.error(
                                                `コンテナ削除エラー: ${containerId}`,
                                                error,
                                            );
                                        }
                                    }

                                    // 新しいテスト用コンテナを作成
                                    const pageName = "test-page";
                                    const lines = [
                                        "これはテスト用のページです。1",
                                        "これはテスト用のページです。2",
                                        "内部リンクのテスト: [test-link]",
                                    ];
                                    (await fluidService.createNewContainer("test-1")).createPage(pageName, lines);
                                    (await fluidService.createNewContainer("test-2")).createPage(pageName, lines);
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

        services?.initFluidClientWithAuth?.();

        // ブラウザ終了時のイベントリスナーを登録
        window.addEventListener("beforeunload", handleBeforeUnload);

        // visibilitychangeイベントリスナーを登録（追加の保険）
        document.addEventListener(
            "visibilitychange",
            handleVisibilityChange,
        );

        // 定期的なログローテーションを設定
        rotationInterval = schedulePeriodicLogRotation();
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
            const { cleanupFluidClient } = await import("../services");
            cleanupFluidClient();
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

    <MobileActionToolbar />

    <button
        class="fixed bottom-4 right-4 p-2 rounded bg-gray-200 dark:bg-gray-700"
        on:click={() => userPreferencesStore.toggleTheme()}
    >
        {currentTheme === "light" ? "Dark Mode" : "Light Mode"}
    </button>
</div>

<style>
/* Keep content clear of the fixed Toolbar (height ~4rem) */
.main-content { padding-top: 5rem; }
</style>
