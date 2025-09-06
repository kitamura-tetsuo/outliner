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
import { userManager } from "../auth/UserManager";
import { setupGlobalDebugFunctions } from "../lib/debug";
import "../utils/ScrapboxFormatter";
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
onMount(() => {
    // ブラウザ環境でのみ実行
    if (browser) {
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
        isAuthenticated = userManager.getCurrentUser() !== null;

        if (isAuthenticated) {
            setupGlobalDebugFunctions();
        } else {
            userManager.addEventListener(authResult => {
                isAuthenticated = authResult !== null;
                if (isAuthenticated && browser) {
                    setupGlobalDebugFunctions();
                }
            });
        }

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
onDestroy(() => {
    // ブラウザ環境でのみ実行
    if (browser) {
        // イベントリスナーを削除
        window.removeEventListener("beforeunload", handleBeforeUnload);
        document.removeEventListener(
            "visibilitychange",
            handleVisibilityChange,
        );

        // 定期的なログローテーションの解除
        if (rotationInterval) {
            clearInterval(rotationInterval);
        }
    }
});
</script>

{@render children()}

<button
    class="fixed bottom-4 right-4 p-2 rounded bg-gray-200 dark:bg-gray-700"
    on:click={() => userPreferencesStore.toggleTheme()}
>
    {currentTheme === "light" ? "Dark Mode" : "Light Mode"}
</button>
