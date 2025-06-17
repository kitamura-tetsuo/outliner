<script lang="ts">
import { browser } from "$app/environment";
import { getEnv } from "$lib/env";
import { i18n } from "$lib/i18n";
import { getLogger } from "$lib/logger";
import { ParaglideJS } from "@inlang/paraglide-sveltekit";
import {
    onDestroy,
    onMount,
} from "svelte";
import "../app.css";
// Import from $lib/index.ts to ensure fetch override is loaded
import "$lib";
import { userManager } from "../auth/UserManager";
import { setupGlobalDebugFunctions } from "../lib/debug";
import * as fluidService from "../lib/fluidService.svelte";
// import {
//     cleanupFluidClient,
//     initFluidClientWithAuth,
// } from "../services";

let { children } = $props();
const logger = getLogger("AppLayout");

// 認証関連の状態
let isAuthenticated = $state(false);
let error: string | null = $state(null);

// APIサーバーのURLを取得
const API_URL = getEnv("VITE_API_SERVER_URL", "http://localhost:7091");

/**
 * ログファイルをローテーションする関数
 */
async function rotateLogFiles() {
    try {
        logger.info(
            "アプリケーション終了時のログローテーションを実行します",
        );

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
                logger.info("ログローテーション完了", result);
                return;
            }
        }
        catch (fetchError) {
            // fetch失敗時はsendBeaconを試す - エラーは記録しない
            logger.debug(
                "通常のfetch呼び出しに失敗、sendBeaconを試行します",
            );
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
            logger.info("ログローテーション実行をスケジュールしました");
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
        logger.info("定期的なログローテーションを実行します");
        rotateLogFiles();
    }, ROTATION_INTERVAL);
}

let rotationInterval: ReturnType<typeof setInterval> | null = null;

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
        logger.info("アプリケーションがマウントされました");

        // 認証状態を確認
        isAuthenticated = userManager.getCurrentUser() !== null;

        // テスト環境では常にデバッグ関数を初期化
        const isTestEnv = import.meta.env.MODE === "test" ||
            process.env.NODE_ENV === "test" ||
            import.meta.env.VITE_IS_TEST === "true";

        if (isTestEnv) {
            // テスト環境では認証状態に関係なくデバッグ関数を初期化
            setupGlobalDebugFunctions(fluidService);
            logger.info("テスト環境のため、デバッグ関数を初期化しました");

            // テスト環境ではUserManagerをグローバルに公開
            (window as any).__USER_MANAGER__ = userManager;
            logger.info("テスト環境のため、UserManagerをグローバルに公開しました");
        }

        if (isAuthenticated) {
            // デバッグ関数を初期化（テスト環境以外）
            if (!isTestEnv) {
                setupGlobalDebugFunctions(fluidService);
            }
        }
        else {
            // 認証状態の変更を監視
            userManager.addEventListener(authResult => {
                isAuthenticated = authResult !== null;
                // デバッグ関数を初期化
                if (isAuthenticated && browser && !isTestEnv) {
                    setupGlobalDebugFunctions(fluidService);
                    const isTestEnv = import.meta.env.MODE === "test" ||
                        process.env.NODE_ENV === "test" ||
                        import.meta.env.VITE_IS_TEST === "true";
                    if (isTestEnv) {
                        // テスト環境では、既存のコンテナを削除してからテスト用のコンテナを作成する
                        (async () => {
                            try {
                                // ユーザーのコンテナリストを取得
                                // const { containers } = await fluidService.getUserContainers();

                                // 既存のコンテナを削除
                                // for (const containerId of containers) {
                                //     try {
                                //         logger.info(
                                //             `テスト環境のため、コンテナを削除します: ${containerId}`,
                                //         );
                                //         const success = await fluidService.deleteContainer(
                                //             containerId,
                                //         );

                                //         if (success) {
                                //             logger.info(
                                //                 `コンテナを削除しました: ${containerId}`,
                                //             );
                                //         }
                                //         else {
                                //             logger.warn(
                                //                 `コンテナの削除に失敗しました: ${containerId}`,
                                //             );
                                //         }
                                //     }
                                //     catch (error) {
                                //         logger.error(
                                //             `コンテナ削除エラー: ${containerId}`,
                                //             error,
                                //         );
                                //     }
                                // }

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
                    }
                }
            });
        }

        // initFluidClientWithAuth();

        // ブラウザ終了時のイベントリスナーを登録
        // window.addEventListener("beforeunload", handleBeforeUnload);

        // visibilitychangeイベントリスナーを登録（追加の保険）
        // document.addEventListener(
        //     "visibilitychange",
        //     handleVisibilityChange,
        // );

        // 定期的なログローテーションを設定
        // rotationInterval = schedulePeriodicLogRotation();
    }
});

// コンポーネント破棄時の処理
onDestroy(() => {
    // ブラウザ環境でのみ実行
    if (browser) {
        // イベントリスナーを削除
        // window.removeEventListener("beforeunload", handleBeforeUnload);
        // document.removeEventListener(
        //     "visibilitychange",
        //     handleVisibilityChange,
        // );

        // cleanupFluidClient();

        // 定期的なログローテーションの解除
        // if (rotationInterval) {
        //     clearInterval(rotationInterval);
        // }
    }
});
</script>

<ParaglideJS {i18n}>
    {@render children()}
</ParaglideJS>
