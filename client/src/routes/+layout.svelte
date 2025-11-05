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
import AliasPicker from "../components/AliasPicker.svelte";
// Defer services import; it depends on UserManager
import { userPreferencesStore } from "../stores/UserPreferencesStore.svelte";

// Load test data helper globally in test environments so E2E can seed data on unknown route
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

// グローバルへのフォールバック公開（早期に window.generalStore を満たす）
if (browser) {
    window.generalStore = window.generalStore || appStore;
    window.appStore = window.appStore || appStore;
}
// URL からプロジェクト/ページを初期化して window.generalStore.project と currentPage を満たす
if (browser) {
    try {
        const parts = window.location.pathname.split("/").filter(Boolean);
        const projectTitle = decodeURIComponent(parts[0] || "Untitled Project");
        const pageTitle = decodeURIComponent(parts[1] || "");

        if (!(appStore as unknown).project) {
            (appStore as unknown).project = (Project as unknown).createInstance(projectTitle);
            console.log("INIT: Provisional Project set in +layout.svelte", { projectTitle, pageTitle });
        }

        // currentPage が未設定で、URL に pageTitle がある場合は準備
        if (pageTitle && !(appStore as unknown).currentPage && (appStore as unknown).project) {
            try {
                const itemsAny: unknown = (appStore as unknown).project.items;
                // 既存ページにタイトル一致があるかチェック
                let found: unknown = null;
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
                if (found) (appStore as unknown).currentPage = found;
            } catch {}
        }
    } catch {}
}

// ルート変化を購読して currentPage を補完（runes準拠）
function ensureCurrentPageByRoute(pj: string, pg: string) {
    try {
        if (!browser || !pg) return;
        const gs: unknown = appStore;
        if (!gs?.project) return;
        const items: unknown = gs.project.items;
        let found: unknown = null;
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
        catch {
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
            catch {
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
            window.__E2E_LAYOUT_MOUNTED__ = true;
            document.dispatchEvent(new Event("E2E_LAYOUT_MOUNTED"));
        } catch {}
        // Dynamically import browser-only modules
        let userManager: unknown;
        let yjsService: unknown;
        try {
            ({ userManager } = await import("../auth/UserManager"));
            yjsService = await import("../lib/yjsService.svelte");
            await import("../services");
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
                        (reg as unknown).sync.register("sync-ops").catch((err: unknown) => {
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
            userManager?.addEventListener((authResult: unknown) => {
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
        // Test-only: normalize drop events so Playwright's dispatchEvent("drop", {dataTransfer}) becomes a real DragEvent
        try {
            if (typeof window !== 'undefined') {
                const origDispatchEventTarget = EventTarget.prototype.dispatchEvent;
                const origDispatchElement = Element.prototype.dispatchEvent;
                // Avoid double-patching
                if (!window.__E2E_DROP_PATCHED__) {
                    window.__E2E_DROP_PATCHED__ = true;

                    const wrap = function(this: unknown, orig: unknown, event: Event): boolean {
                        try { console.log('[E2E] dispatchEvent:', event?.type, 'instanceof DragEvent=', event instanceof DragEvent); } catch {}
                        try { if (event && event.type === 'drop') { window.__E2E_ATTEMPTED_DROP__ = true; } } catch {}
                        try {
                            if (event && event.type === 'drop' && !(event instanceof DragEvent)) {
                                const de = new DragEvent('drop', {
                                    bubbles: true,
                                    cancelable: true,
                                } as DragEventInit);
                                try { Object.defineProperty(de, 'dataTransfer', { value: (event as unknown).dataTransfer, configurable: true }); } catch {}
                                try { window.__E2E_DROP_HANDLERS__?.forEach((fn: unknown) => { try { fn(this, de); } catch {} }); } catch {}
                                return orig.call(this, de);
                            }
                        } catch {}
                        try { if (event && event.type === 'drop') { window.__E2E_DROP_HANDLERS__?.forEach((fn: unknown) => { try { fn(this, event); } catch {} }); } } catch {}
                        return orig.call(this, event);
                    };

                    // Patch both EventTarget and Element to maximize coverage
                    // @ts-expect-error - Need to patch prototype for E2E drag/drop testing
                    EventTarget.prototype.dispatchEvent = function(event: Event): boolean { return wrap.call(this, origDispatchEventTarget, event); };
                    Element.prototype.dispatchEvent = function(event: Event): boolean { return wrap.call(this, origDispatchElement, event); };

                    console.log('[E2E] Patched EventTarget.prototype.dispatchEvent and Element.prototype.dispatchEvent for drop events');
                    try {
                        window.addEventListener('drop', (e: unknown) => {
                            try { console.log('[E2E] window drop listener:', { type: e?.type, isDragEvent: e instanceof DragEvent, hasDT: !!e?.dataTransfer, dtTypes: e?.dataTransfer?.types }); } catch {}
                        }, true);
                    } catch {}

                    // Record files added into DataTransfer in E2E to recover when event.dataTransfer is unavailable in Playwright isolated world
                    try {
                        const anyWin: unknown = window as unknown;
                        anyWin.__E2E_LAST_FILES__ = [] as File[];
                        const itemsProto = (DataTransferItemList as unknown)?.prototype;
                        if (itemsProto && !anyWin.__E2E_DT_ADD_PATCHED__) {
                            anyWin.__E2E_DT_ADD_PATCHED__ = true;
                            const origAdd = itemsProto.add;
                            itemsProto.add = function(data: unknown, type?: string) {
                                try {
                                    if (data instanceof File) {
                                        anyWin.__E2E_LAST_FILES__.push(data);
                                        try { console.log('[E2E] DataTransfer.items.add(File): recorded', { name: data.name, type: data.type, size: data.size }); } catch {}
                                    }
                                } catch {}
                                return origAdd ? origAdd.call(this, data, type) : undefined;
                            };
                        }

                        // Getterフック: DataTransfer.prototype.items の getter をラップして add をプロキシ化
                        try {
                            const desc = Object.getOwnPropertyDescriptor(DataTransfer.prototype as unknown, 'items');
                            if (desc && typeof desc.get === 'function' && !anyWin.__E2E_DT_ITEMS_GETTER_PATCHED__) {
                                anyWin.__E2E_DT_ITEMS_GETTER_PATCHED__ = true;
                                Object.defineProperty(DataTransfer.prototype as unknown, 'items', {
                                    configurable: true,
                                    enumerable: true,
                                    get: function() {
                                        const list = desc.get!.call(this);
                                        try {
                                            if (list && typeof list.add === 'function' && !list.__e2eAddPatched) {
                                                const orig = list.add;
                                                list.add = function(data: unknown, _type?: string) {
                                                    try { if (data instanceof File) anyWin.__E2E_LAST_FILES__.push(data); } catch {}
                                                    return orig.apply(this, [data, _type]);
                                                } as unknown;
                                                (list as unknown).__e2eAddPatched = true;
                                                try { console.log('[E2E] Patched DT.items.add via getter'); } catch {}
                                            }
                                        } catch {}
                                        return list;
                                    }
                                });
                            }
                        } catch {}

                        // Fallback: wrap File constructor to record created files from evaluateHandle context as well
                        if (!anyWin.__E2E_FILE_CTOR_PATCHED__) {
                            anyWin.__E2E_FILE_CTOR_PATCHED__ = true;
                            const OrigFile = window.File;
                            if (OrigFile) {
                                const Wrapped = new Proxy(OrigFile, {
                                    construct(target: unknown, args: unknown[]) {
                                        const f = new target(...args);
                                        try { anyWin.__E2E_LAST_FILES__.push(f); } catch {}
                                        try { console.log('[E2E] File constructed:', { name: f.name, type: f.type, size: f.size }); } catch {}
                                        return f;
                                    }
                                });
                                // @ts-expect-error - Need to replace window.File for E2E attachment testing
                                window.File = Wrapped;
                            }
                        }

                        // Stronger fallback: wrap DataTransfer constructor to ensure items.add is patched per instance
                        if (!anyWin.__E2E_DT_CTOR_PATCHED__) {
                            anyWin.__E2E_DT_CTOR_PATCHED__ = true;
                            const OrigDT = window.DataTransfer;
                            if (OrigDT) {
                                const WrappedDT = new Proxy(OrigDT, {
                                    construct(target: unknown, args: unknown[]) {
                                        const dt = new target(...args);
                                        try {
                                            const list: unknown = (dt as unknown).items;
                                            if (list && typeof list.add === 'function' && !list.__e2eAddPatched) {
                                                const origAdd = list.add;
                                                list.add = function(data: unknown, _type?: string) {
                                                    try { if (data instanceof File) anyWin.__E2E_LAST_FILES__.push(data); } catch {}
                                                    try { console.log('[E2E] DT(instance).items.add called'); } catch {}
                                                    return origAdd.apply(this, [data, _type]);
                                                } as unknown;
                                                (list as unknown).__e2eAddPatched = true;
                                            }
                                        } catch {}
                                        return dt;
                                    }
                                });
                                // @ts-expect-error - Need to replace window.DataTransfer for E2E drag/drop testing
                                window.DataTransfer = WrappedDT;
                            }
                        }
                    } catch {}
                }
            }
        } catch {}

        // DEBUG: log drop/dragover events globally to diagnose Playwright dispatchEvent
        try {
            window.addEventListener('drop', (ev: unknown) => {
                try { console.log('[GlobalDrop] drop received target=', (ev?.target as unknown)?.className || (ev?.target as unknown)?.tagName); } catch {}
            }, { capture: true });
            document.addEventListener('drop', (ev: unknown) => {
                try { console.log('[DocDrop] drop received target=', (ev?.target as unknown)?.className || (ev?.target as unknown)?.tagName); } catch {}
            }, { capture: true });
            window.addEventListener('dragover', (ev: unknown) => {
                try { console.log('[GlobalDrop] dragover received target=', (ev?.target as unknown)?.className || (ev?.target as unknown)?.tagName); } catch {}
            }, { capture: true });
        } catch {}

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

<div data-testid="app-layout">
    <!-- Global main toolbar with SearchBox (SEA-0001) -->
    <Toolbar />

    <!-- Global AliasPicker component -->
    <AliasPicker />

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

/* Keep content clear of the fixed Toolbar (height ~4rem) */
.main-content { padding-top: 5rem; }
</style>
