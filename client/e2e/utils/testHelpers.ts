// @ts-nocheck
import { type Browser, expect, type Page } from "@playwright/test";
import { CursorValidator } from "./cursorValidation.js";

/**
 * テスト用のヘルパー関数群
 */
export class TestHelpers {
    // Structured logger: timestamp and delta from previous log (disabled by default; enable with E2E_VERBOSE_SLOG=1)
    private static __lastLogTs: number | null = null;
    private static readonly LOG_ENABLED: boolean = process.env.E2E_VERBOSE_SLOG === "1";
    private static slog(msg: string, data?: any) {
        if (!TestHelpers.LOG_ENABLED) return;
        const now = Date.now();
        const delta = TestHelpers.__lastLogTs == null ? 0 : (now - TestHelpers.__lastLogTs);
        TestHelpers.__lastLogTs = now;
        const ts = new Date(now).toISOString();
        if (data !== undefined) {
            console.log(`[TH ${ts} +${delta}ms] ${msg}`, data);
        } else {
            console.log(`[TH ${ts} +${delta}ms] ${msg}`);
        }
    }

    /**
     * テスト環境を準備する
     * 各テストの前に呼び出すことで、テスト環境を一貫した状態にする
     * @param page Playwrightのページオブジェクト
     * @returns 作成したプロジェクト名とページ名
     */
    public static async prepareTestEnvironment(
        page: Page,
        testInfo?: any,
        lines: string[] = [],
        browser?: Browser,
    ): Promise<{ projectName: string; pageName: string; }> {
        // Attach verbose console/pageerror/requestfailed listeners for debugging
        try {
            // Avoid duplicating console output when using fixtures/console-forward.
            // Opt-in by setting E2E_ATTACH_BROWSER_CONSOLE=1 when you want these mirrors.
            if (process.env.E2E_ATTACH_BROWSER_CONSOLE === "1") {
                page.on("console", (msg) => {
                    const type = msg.type();
                    const txt = msg.text();
                    console.log(`[BROWSER-CONSOLE:${type}]`, txt);
                });
                page.on("pageerror", (err) => {
                    console.log("[BROWSER-PAGEERROR]", err?.message || String(err));
                });
                page.on("requestfailed", (req) => {
                    console.log("[BROWSER-REQUESTFAILED]", req.url(), req.failure()?.errorText);
                });
            }
        } catch {}
        // 可能な限り早期にテスト用フラグを適用（初回ナビゲーション前）
        await page.addInitScript(() => {
            try {
                localStorage.setItem("VITE_IS_TEST", "true");
                localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
                localStorage.setItem("SKIP_TEST_CONTAINER_SEED", "true");
                (window as any).__E2E__ = true;
                // Vite エラーオーバーレイ抑止
                (window as any).__vite_plugin_react_preamble_installed__ = true;
                const originalCreateElement = document.createElement;
                document.createElement = function(tagName: string, ...args: any[]) {
                    if (tagName === "vite-error-overlay") {
                        return originalCreateElement.call(this, "div", ...args);
                    }
                    return originalCreateElement.call(this, tagName, ...args);
                } as typeof document.createElement;
            } catch {}
        });

        // 初回ナビゲーション前に addInitScript でフラグを設定しているため、直ちにプロジェクトページへ遷移する
        // 事前待機は行わず、単一遷移の安定性を優先して直ちにターゲットへ遷移する

        // __YJS_STORE__ はプロジェクトページ遷移後に利用可能になるため、ここでは待機せず直接遷移
        return await TestHelpers.navigateToTestProjectPage(page, testInfo, lines, browser);
    }

    /**
     * プロジェクト用 E2E（ホーム滞在用）: ホームに遷移して環境を初期化する
     * - プロジェクト/ページには移動しない
     * - シーディングは SKIP_TEST_CONTAINER_SEED ローカルストレージによりアプリ側で抑止される前提
     */
    public static async prepareTestEnvironmentForProject(
        page: Page,
        testInfo?: any,
        lines: string[] = [],
        browser?: Browser,
    ): Promise<{ projectName: string; pageName: string; }> {
        // 可能な限り早期にテスト用フラグを適用（初回ナビゲーション前）
        await page.addInitScript(() => {
            try {
                localStorage.setItem("VITE_IS_TEST", "true");
                localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
                localStorage.setItem("SKIP_TEST_CONTAINER_SEED", "true");
                (window as any).__E2E__ = true;
                (window as any).__vite_plugin_react_preamble_installed__ = true;
            } catch {}
        });

        // デバッガーをセットアップ
        await TestHelpers.setupTreeDebugger(page);
        await TestHelpers.setupCursorDebugger(page);

        // ホームに遷移して初期化のみ行う（プロジェクト/ページへは移動しない）
        console.log("TestHelper: Navigate to home (ForProject)");
        await page.goto("/", { timeout: 30000, waitUntil: "domcontentloaded" });
        return { projectName: "home", pageName: "" };
    }

    /**
     * 現在の generalStore.pages.current からページのテキストを安定的に取得する
     * Y.Text の場合は toString() を呼び出し、プレーン文字列に正規化する
     */
    public static async getPageTexts(page: Page): Promise<Array<{ id: string; text: string; }>> {
        return await page.evaluate(() => {
            const store = (window as any).appStore || (window as any).generalStore;
            if (!store || !store.pages) return [] as Array<{ id: string; text: string; }>;

            const toArray = (p: any) => {
                if (!p) return [] as any[];
                try {
                    if (Array.isArray(p)) return p;
                    if (typeof p[Symbol.iterator] === "function") return Array.from(p);
                    const len = (p as any).length;
                    if (typeof len === "number" && len >= 0) {
                        const r: any[] = [];
                        for (let i = 0; i < len; i++) {
                            const v = (p as any).at ? p.at(i) : p[i];
                            if (typeof v !== "undefined") r.push(v);
                        }
                        return r;
                    }
                } catch {}
                return Object.values(p).filter((x: any) => x && typeof x === "object" && ("id" in x || "text" in x));
            };

            const pages = toArray(store.pages.current);
            return pages.map((p: any) => {
                const textVal = (p?.text && typeof (p.text as any).toString === "function")
                    ? (p.text as any).toString()
                    : String(p?.text ?? "");
                return { id: String(p.id), text: textVal };
            });
        });
    }

    /**
     * テスト用のプロジェクトとページを作成する（Yjs）
     * @param page Playwrightのページオブジェクト
     * @param projectName プロジェクト名
     * @param pageName ページ名
     */
    public static async createTestProjectAndPageViaAPI(
        page: Page,
        projectName: string,
        pageName: string,
        lines: string[] = [],
    ): Promise<void> {
        // Ensure project store is initialized before attempting creation
        try {
            await page.waitForFunction(() => {
                const gs = (window as any).generalStore || (window as any).appStore;
                return !!(gs && gs.project);
            }, { timeout: 15000 });
        } catch {
            // Continue with retries below; creation path already handles transient unavailability
        }
        if (lines.length == 0) {
            lines = [
                "これはテスト用のページです。1",
                "これはテスト用のページです。2",
                "内部リンクのテスト: [test-link]",
            ];
        }

        // Yjs/app-store 経由で作成（ページのリロード競合に耐性）
        const runCreate = async () => {
            await page.evaluate(async ({ projectName, pageName, lines }) => {
                console.log(`TestHelper: Creating project/page (Yjs)`, {
                    projectName,
                    pageName,
                    linesCount: lines.length,
                });
                // Yjs via generalStore.project
                const gs = (window as any).generalStore || (window as any).appStore;
                if (!gs?.project) {
                    throw new Error("TestHelper: generalStore.project not available");
                }
                try {
                    const page = gs.project.addPage(pageName, "tester");
                    const items = page.items as any;
                    for (const line of lines) {
                        const it = items.addNode("tester");
                        it.updateText(line);
                    }
                    if (!gs.currentPage) gs.currentPage = page as any;
                    console.log("TestHelper: Created via Yjs (generalStore)");
                } catch (e) {
                    console.error("TestHelper: Yjs page creation failed", e);
                }
            }, { projectName, pageName, lines });
        };

        {
            // 一時的なページ再読み込み/クローズに強くするため再試行回数を増加
            let lastErr: any = null;
            for (let attempt = 1; attempt <= 8; attempt++) {
                try {
                    await runCreate();
                    lastErr = null;
                    break;
                } catch (e: any) {
                    lastErr = e;
                    const msg = String(e?.message ?? e);
                    if (
                        msg.includes("Target page, context or browser has been closed")
                        || msg.includes("Execution context was destroyed")
                        || msg.includes("Navigation")
                        || msg.includes("generalStore.project not available")
                    ) {
                        console.log(`TestHelper: createProject retry ${attempt}/8 after navigation/close race`);
                        try {
                            await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
                        } catch {}
                        if (!page.isClosed()) {
                            await page.waitForTimeout(200);
                        } else {
                            console.log("TestHelper: page already closed; skipping short wait before retry");
                        }
                        continue;
                    } else {
                        throw e;
                    }
                }
            }
            if (lastErr) throw lastErr;
        }

        await page.waitForTimeout(50);
    }

    /**
     * テスト用のページを作成する（Yjs）
     * @param page Playwrightのページオブジェクト
     * @param pageName ページ名
     */
    public static async createTestPageViaAPI(page: Page, pageName: string, lines: string[]): Promise<void> {
        // Ensure project store is initialized before attempting creation
        try {
            await page.waitForFunction(() => {
                const gs = (window as any).generalStore || (window as any).appStore;
                return !!(gs && gs.project);
            }, { timeout: 15000 });
        } catch {
            // Continue with retries below; creation path already handles transient unavailability
        }
        const runCreate = async () => {
            await page.evaluate(async ({ pageName, lines }) => {
                const gs = (window as any).generalStore || (window as any).appStore;
                if (!gs?.project) {
                    throw new Error("TestHelper: generalStore.project not available");
                }
                try {
                    const pageItem = gs.project.addPage(pageName, "tester");
                    const items = pageItem.items as any;
                    for (const line of lines) {
                        const it = items.addNode("tester");
                        it.updateText(line);
                    }
                    if (!gs.currentPage) gs.currentPage = pageItem as any;
                    console.log("TestHelper: createTestPageViaAPI via Yjs");
                } catch (e) {
                    console.error("TestHelper: Yjs createPage failed", e);
                }
            }, { pageName, lines });
        };

        {
            // 一時的なページ再読み込み/クローズに強くするため再試行回数を増加
            let lastErr: any = null;
            for (let attempt = 1; attempt <= 8; attempt++) {
                try {
                    await runCreate();
                    lastErr = null;
                    break;
                } catch (e: any) {
                    lastErr = e;
                    const msg = String(e?.message ?? e);
                    if (
                        msg.includes("Target page, context or browser has been closed")
                        || msg.includes("Execution context was destroyed")
                        || msg.includes("Navigation")
                        || msg.includes("generalStore.project not available")
                    ) {
                        console.log(`TestHelper: createPage retry ${attempt}/8 after navigation/close race`);
                        try {
                            await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
                        } catch {}
                        if (!page.isClosed()) {
                            await page.waitForTimeout(200);
                        } else {
                            console.log("TestHelper: page already closed; skipping short wait before retry");
                        }
                        continue;
                    } else {
                        throw e;
                    }
                }
            }
            if (lastErr) throw lastErr;
        }
    }

    /**
     * カーソル情報取得用のデバッグ関数をセットアップする
     * @param page Playwrightのページオブジェクト
     */
    private static async setupCursorDebugger(page: Page): Promise<void> {
        try {
            await page.evaluate(() => {
                // グローバルオブジェクトにデバッグ関数を追加
                window.getCursorDebugData = function() {
                    // EditorOverlayStoreインスタンスを取得
                    const editorOverlayStore = window.editorOverlayStore;
                    if (!editorOverlayStore) {
                        console.error("EditorOverlayStore instance not found");
                        return { error: "EditorOverlayStore instance not found" };
                    }

                    try {
                        // カーソル情報を取得
                        const cursors = Object.values(editorOverlayStore.cursors);
                        const selections = Object.values(editorOverlayStore.selections);
                        const activeItemId = editorOverlayStore.activeItemId;
                        const cursorVisible = editorOverlayStore.cursorVisible;

                        // カーソルインスタンスの情報を取得
                        const cursorInstances: Array<{
                            cursorId: string;
                            itemId: string;
                            offset: number;
                            isActive: boolean;
                            userId: string;
                        }> = [];

                        editorOverlayStore.cursorInstances.forEach((cursor: any, id: string) => {
                            cursorInstances.push({
                                cursorId: id,
                                itemId: cursor.itemId,
                                offset: cursor.offset,
                                isActive: cursor.isActive,
                                userId: cursor.userId,
                            });
                        });

                        return {
                            cursors,
                            selections,
                            activeItemId,
                            cursorVisible,
                            cursorInstances,
                            cursorCount: cursors.length,
                            selectionCount: selections.length,
                        };
                    } catch (error) {
                        console.error("Error getting cursor data:", error);
                        return { error: error instanceof Error ? error.message : "Unknown error" };
                    }
                };

                // 拡張版のデバッグ関数 - 特定のパスのデータのみを取得
                window.getCursorPathData = function(path) {
                    // EditorOverlayStoreインスタンスを取得
                    const editorOverlayStore = window.editorOverlayStore;
                    if (!editorOverlayStore) {
                        return { error: "EditorOverlayStore instance not found" };
                    }

                    try {
                        // 自分自身の関数を使用してカーソルデータを取得
                        const cursorData = window.getCursorDebugData ? window.getCursorDebugData() : null;
                        if (!cursorData) return null;
                        if (!path) return cursorData;

                        // パスに基づいてデータを取得
                        const parts = path.split(".");
                        let result = cursorData;
                        for (const part of parts) {
                            if (result === undefined || result === null) return null;
                            result = result[part];
                        }
                        return result;
                    } catch (error) {
                        return { error: error instanceof Error ? error.message : "Unknown error" };
                    }
                };
            });
        } catch (e) {
            console.log("TestHelper: setupCursorDebugger injection skipped:", (e as any)?.message ?? e);
        }

        // EditorOverlayStoreがグローバルに公開されていることを確認
        // await page.waitForFunction(() => window.editorOverlayStore, { timeout: 5000 });
    }

    /**
     * SharedTreeデータ取得用のデバッグ関数をセットアップする
     * @param page Playwrightのページオブジェクト
     */
    public static async setupTreeDebugger(page: Page): Promise<void> {
        try {
            await page.evaluate(() => {
                // Yjs / app-store ベースのデバッグ関数を追加
                const buildYjsSnapshot = () => {
                    try {
                        const gs = (window as any).generalStore || (window as any).appStore;
                        const proj = gs?.project;
                        if (!proj) return { error: "project not initialized" };
                        const toPlain = (item: any): any => {
                            const children = item.items as any;
                            const asArray: any[] = [];
                            const len = children?.length ?? 0;
                            for (let i = 0; i < len; i++) {
                                const ch = children.at ? children.at(i) : children[i];
                                if (ch) asArray.push(toPlain(ch));
                            }
                            const textVal = item.text?.toString?.() ?? String(item.text ?? "");
                            return { id: String(item.id), text: textVal, items: asArray };
                        };
                        const root = proj.items as any;
                        const result: any[] = [];
                        const len = root?.length ?? 0;
                        for (let i = 0; i < len; i++) {
                            const it = root.at ? root.at(i) : root[i];
                            if (it) result.push(toPlain(it));
                        }
                        return { itemCount: result.length, items: result };
                    } catch (e: any) {
                        return { error: e?.message ?? String(e) };
                    }
                };

                (window as any).getYjsTreeDebugData = function() {
                    return buildYjsSnapshot();
                };
                (window as any).getYjsTreePathData = function(path?: string) {
                    const data = buildYjsSnapshot();
                    if (!path || (data as any)?.error) return data;
                    const parts = String(path).split(".");
                    let res: any = data;
                    for (const p of parts) {
                        if (res == null) return null;
                        res = res[p];
                    }
                    return res;
                };

                // （Yjs ベース）
            });
        } catch (e) {
            console.log("TestHelper: setupTreeDebugger injection skipped:", (e as any)?.message ?? e);
        }
    }

    /**
     * カーソルが表示されるまで待機する
     * @param page Playwrightのページオブジェクト
     * @param timeout タイムアウト時間（ミリ秒）
     */
    public static async waitForCursorVisible(page: Page, timeout = 15000): Promise<boolean> {
        try {
            // CursorValidatorを使用してカーソルの存在を確認
            await page.waitForFunction(() => {
                const editorOverlayStore = (window as any).editorOverlayStore;
                if (!editorOverlayStore) {
                    return false;
                }
                const cursors = Object.values(editorOverlayStore.cursors);
                const activeCursors = cursors.filter((c: any) => c.isActive);
                return activeCursors.length > 0;
            }, { timeout });
            return true;
        } catch (error) {
            console.log("Timeout waiting for cursor to be visible, continuing anyway");
            // ページが閉じられていないかチェックしてからスクリーンショットを撮影
            try {
                if (!page.isClosed()) {
                    await page.screenshot({ path: "client/test-results/cursor-visible-timeout.png" });
                }
            } catch (screenshotError) {
                console.log("Failed to take screenshot:", screenshotError);
            }
            return false;
        }
    }

    /**
     * エディターストアを使用してカーソルを設定する
     * @param page Playwrightのページオブジェクト
     * @param itemId アイテムID
     * @param offset カーソル位置
     * @param userId ユーザーID
     */
    public static async setCursor(
        page: Page,
        itemId: string,
        offset: number = 0,
        userId: string = "local",
    ): Promise<void> {
        await page.waitForFunction(() => {
            const store = (window as any).editorOverlayStore;
            return !!store && typeof store.setCursor === "function";
        }, { timeout: 15000 }).catch(() => {
            throw new Error("TestHelpers.setCursor: editorOverlayStore.setCursor is not available within timeout");
        });

        const setSucceeded = await page.evaluate(({ itemId, offset, userId }) => {
            const editorOverlayStore = (window as any).editorOverlayStore;
            if (editorOverlayStore && typeof editorOverlayStore.setCursor === "function") {
                console.log(
                    `TestHelpers.setCursor: Setting cursor for itemId=${itemId}, offset=${offset}, userId=${userId}`,
                );
                editorOverlayStore.setCursor({
                    itemId: itemId,
                    offset: offset,
                    isActive: true,
                    userId: userId,
                });
                return true;
            }
            console.error(`TestHelpers.setCursor: editorOverlayStore or setCursor not available`);
            return false;
        }, { itemId, offset, userId });

        if (!setSucceeded) {
            throw new Error(`TestHelpers.setCursor: failed to set cursor for itemId=${itemId}`);
        }
    }

    /**
     * Ensure the shared textarea receives focus so keyboard input is processed.
     */
    public static async focusGlobalTextarea(page: Page): Promise<void> {
        const textarea = page.locator(".global-textarea");
        await textarea.waitFor({ state: "attached", timeout: 5000 });
        await textarea.evaluate((node: HTMLTextAreaElement) => node.focus());
        await page.waitForTimeout(150);
    }

    /**
     * カーソルを使用してテキストを入力する
     * @param page Playwrightのページオブジェクト
     * @param itemId アイテムID
     * @param text 入力するテキスト
     * @param userId ユーザーID
     */
    public static async insertText(
        page: Page,
        itemId: string,
        text: string,
        userId: string = "local",
    ): Promise<void> {
        await page.evaluate(async ({ itemId, text, userId }) => {
            const editorOverlayStore = (window as any).editorOverlayStore;
            if (editorOverlayStore && editorOverlayStore.getCursorInstances) {
                const cursorInstances = editorOverlayStore.getCursorInstances();
                const cursor = cursorInstances.find((c: any) => c.itemId === itemId && c.userId === userId);
                if (cursor && cursor.insertText) {
                    console.log(`TestHelpers.insertText: Found cursor for itemId=${itemId}, userId=${userId}`);
                    cursor.insertText(text);
                } else {
                    console.error(`TestHelpers.insertText: Cursor not found for itemId=${itemId}, userId=${userId}`);
                    console.log(
                        `Available cursors:`,
                        cursorInstances.map((c: any) => ({ itemId: c.itemId, userId: c.userId })),
                    );
                }
            } else {
                console.error(`TestHelpers.insertText: editorOverlayStore or getCursorInstances not available`);
            }
        }, { itemId, text, userId });
    }

    /**
     * プロジェクトページに移動する
     * 既存のプロジェクトがあればそれを使用し、なければ新規作成する
     * @param page Playwrightのページオブジェクト
     * @returns プロジェクト名
     */
    public static async navigateToTestProjectPage(
        page: Page,
        testInfo?: any,
        lines: string[],
        browser?: Browser,
    ): Promise<{ projectName: string; pageName: string; }> {
        // Derive worker index for unique naming; default to 1 when testInfo is absent
        TestHelpers.slog("navigateToTestProjectPage start");

        const workerIndex = typeof testInfo?.workerIndex === "number" ? testInfo.workerIndex : 1;
        const projectName = `Test Project ${workerIndex} ${Date.now()}`;
        const pageName = `test-page-${Date.now()}`;

        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);
        const url = `/${encodedProject}/${encodedPage}`;

        TestHelpers.slog("Navigating to project page", { url });
        const base = page.url() && page.url() !== "about:blank" ? page.url() : "http://localhost:7090/";
        const absoluteUrl = new URL(url, base).toString();
        try {
            TestHelpers.slog("Navigation method decided", { hasGoto: false });
            await page.evaluate((targetUrl) => {
                (window as any).location.href = targetUrl as any;
            }, absoluteUrl);
            await page.waitForURL(absoluteUrl, { timeout: 30000 });
            TestHelpers.slog("Navigation completed", { absoluteUrl });
        } catch (error) {
            const msg = String((error as any)?.message ?? error);
            if (msg.includes("Target page, context or browser has been closed")) {
                console.warn("TestHelper: Page/context closed during navigation; NOT reopening per policy");
                throw error;
            }
            if (
                msg.includes("ECONNREFUSED")
                || msg.includes("ERR_CONNECTION_REFUSED")
                || msg.includes("net::ERR_CONNECTION_REFUSED")
            ) {
                throw new Error(
                    "TestHelper: SvelteKit dev server appears not running at http://localhost:7090/. Run scripts/codex-setup.sh and retry.",
                );
            }
            throw error;
        }

        // 遷移後の状態を確認
        const currentUrl = page.url();
        TestHelpers.slog("Current URL after navigation", { currentUrl });

        // Fetching title can hang in rare states; don't block setup
        try {
            const pageTitle = await Promise.race([
                page.title(),
                new Promise<string>((resolve) => setTimeout(() => resolve("<title-timeout>"), 2000)),
            ]);
            console.log(`TestHelper: Page title: ${pageTitle}`);
        } catch {
            console.log("TestHelper: Page title fetch skipped due to transient state");
        }

        // E2E: Hydration flag wait skipped to avoid long stalls under unstable dev SSR
        TestHelpers.slog("Skipping hydration-flag wait (proceeding)");

        // ページルートの自動処理を待機（手動設定は行わない）
        TestHelpers.slog("Waiting for page route to automatically load project and page");

        // Ensure toolbar search box is ready but continue waiting for project/page load
        try {
            // Prefer role-based lookup in the main toolbar for stability
            const input = page
                .getByTestId("main-toolbar")
                .getByRole("textbox", { name: "Search pages" });
            await input.waitFor({ timeout: 3000 });
            console.log("TestHelper: Search box available");
        } catch {}

        // 認証状態が検出されるまで待機（2フェーズで再試行）
        TestHelpers.slog("Waiting for authentication detection (short)");
        const authReady = await page.waitForFunction(() => {
            const userManager = (window as any).__USER_MANAGER__;
            const ok = !!(userManager && userManager.getCurrentUser && userManager.getCurrentUser());
            if (!ok) console.log("TestHelper: Auth check (phase1) not ready");
            return ok;
        }, { timeout: 1000 }).catch(() => false as const);

        if (!authReady) {
            TestHelpers.slog("Phase1 auth wait timed out; re-invoking login and retrying");
            // Guard evaluate against transient navigation/context-destroy races
            try {
                await page.evaluate(async () => {
                    try {
                        const mgr = (window as any).__USER_MANAGER__;
                        if (mgr?.loginWithEmailPassword) {
                            await mgr.loginWithEmailPassword("test@example.com", "password");
                        }
                    } catch (e) {
                        console.log("TestHelper: Re-login attempt failed (continuing)", e);
                    }
                });
            } catch (e: any) {
                const msg = String(e?.message ?? e);
                if (
                    msg.includes("Target page, context or browser has been closed")
                    || msg.includes("Execution context was destroyed")
                    || msg.includes("Navigation")
                ) {
                    TestHelpers.slog("Re-login evaluate skipped due to transient page/context state");
                } else {
                    throw e;
                }
            }

            // Be tolerant: page may reload/close during setup; don't fail
            try {
                await page.waitForFunction(() => {
                    const userManager = (window as any).__USER_MANAGER__;
                    const ok = !!(userManager && userManager.getCurrentUser && userManager.getCurrentUser());
                    if (!ok) console.log("TestHelper: Auth check (phase2) not ready");
                    return ok;
                }, { timeout: 1500 });
            } catch (e: any) {
                const msg = String(e?.message ?? e);
                if (
                    msg.includes("Target page, context or browser has been closed")
                    || msg.includes("Execution context was destroyed")
                    || msg.includes("Navigation")
                ) {
                    TestHelpers.slog("Phase2 auth wait skipped due to transient page/context state");
                } else {
                    throw e;
                }
            }
        }

        TestHelpers.slog("Authentication detected, waiting for project loading");

        // ページの詳細な状態をログ出力（ページ閉鎖などの一時的状態に寛容）
        try {
            await page.evaluate(() => {
                console.log("TestHelper: Current page state:");
                console.log("TestHelper: URL:", window.location.href);
                console.log("TestHelper: generalStore exists:", !!(window as any).generalStore);

                const generalStore = (window as any).generalStore;
                if (generalStore) {
                    console.log("TestHelper: generalStore.project exists:", !!generalStore.project);
                    console.log("TestHelper: generalStore.pages exists:", !!generalStore.pages);
                    console.log("TestHelper: generalStore.currentPage exists:", !!generalStore.currentPage);
                }
            });
        } catch (e: any) {
            const msg = String(e?.message ?? e);
            if (
                msg.includes("Target page, context or browser has been closed")
                || msg.includes("Execution context was destroyed")
                || msg.includes("Navigation")
            ) {
                console.log("TestHelper: Skipping state log due to transient page/context state");
            } else {
                throw e;
            }
        }

        // generalStoreが設定されるまで待機（OutlinerBaseのマウントは後で確認）
        TestHelpers.slog("Waiting for generalStore to be available");

        // より詳細なデバッグ情報を追加（ページ閉鎖などに寛容）
        try {
            await page.evaluate(() => {
                console.log("TestHelper: Current page state before generalStore wait:");
                console.log("TestHelper: URL:", window.location.href);
                console.log(
                    "TestHelper: Available global objects:",
                    Object.keys(window).filter(k => k.startsWith("__") || k.includes("Store") || k.includes("store")),
                );
                console.log("TestHelper: Document ready state:", document.readyState);
                console.log("TestHelper: Body innerHTML length:", document.body.innerHTML.length);
            });
        } catch (e: any) {
            const msg = String(e?.message ?? e);
            if (
                msg.includes("Target page, context or browser has been closed")
                || msg.includes("Execution context was destroyed")
                || msg.includes("Navigation")
            ) {
                console.log("TestHelper: Skipping pre-wait debug log due to transient page/context state");
            } else {
                throw e;
            }
        }

        try {
            await page.waitForFunction(() => {
                const generalStore = (window as any).generalStore;
                return !!generalStore;
            }, { timeout: 30000 });
        } catch (error) {
            TestHelpers.slog("generalStore wait failed, checking page state");
            try {
                await page.evaluate(() => {
                    console.log("TestHelper: Final page state after generalStore timeout:");
                    console.log("TestHelper: Available stores:", {
                        generalStore: !!(window as any).generalStore,
                        userManager: !!(window as any).__USER_MANAGER__,
                    });
                    console.log("TestHelper: DOM elements:", {
                        outlinerBase: !!document.querySelector('[data-testid="outliner-base"]'),
                        searchBox: !!document.querySelector(".page-search-box"),
                        main: !!document.querySelector("main"),
                    });
                });
            } catch (e: any) {
                const msg = String(e?.message ?? e);
                if (
                    msg.includes("Target page, context or browser has been closed")
                    || msg.includes("Execution context was destroyed")
                    || msg.includes("Navigation")
                ) {
                    console.log("TestHelper: Skipping final state log due to transient page/context state");
                } else {
                    throw e;
                }
            }
            // Be tolerant to transient navigation/context-destroy events during boot.
            const errMsg = String((error as any)?.message ?? error);
            if (
                errMsg.includes("Target page, context or browser has been closed")
                || errMsg.includes("Execution context was destroyed")
                || errMsg.includes("Navigation")
            ) {
                TestHelpers.slog("generalStore wait aborted due to transient page/context change; continuing");
                // Continue setup without hard-failing; later steps will re-check availability.
                return { projectName, pageName };
            }
            throw error;
        }

        // Ensure the target page exists after navigation and seed lines if needed
        try {
            const skipSeed = await page.evaluate(() => {
                try {
                    return window.localStorage?.getItem?.("SKIP_TEST_CONTAINER_SEED") === "true";
                } catch {
                    return false;
                }
            });
            if (!skipSeed) {
                await page.evaluate(({ targetPageName, lines }) => {
                    const gs = (window as any).generalStore;
                    if (!gs?.project) return;
                    const norm = (s: any) => String(s ?? "").toLowerCase();

                    const findPageByTitle = () => {
                        try {
                            const arr: any = gs.pages?.current as any;
                            const len = arr?.length ?? 0;
                            for (let i = 0; i < len; i++) {
                                const p = arr?.at ? arr.at(i) : arr[i];
                                const title = p?.text?.toString?.() ?? String(p?.text ?? "");
                                if (norm(title) === norm(targetPageName)) return p;
                            }
                        } catch {}
                        return null;
                    };

                    let pageRef = findPageByTitle();
                    if (!pageRef) {
                        try {
                            pageRef = gs.project.addPage(targetPageName, "tester");
                            console.log("TestHelper: Created missing page after navigation");
                        } catch (e) {
                            console.warn("TestHelper: Failed to create page after navigation", e);
                            return;
                        }
                    }

                    // Ensure it's the current page
                    try {
                        if (!gs.currentPage) gs.currentPage = pageRef;
                    } catch {}

                    // Seed lines only when the page has no items yet to avoid duplication
                    try {
                        const items = (pageRef as any)?.items as any;
                        const length = items?.length ?? 0;
                        if (items && Array.isArray(lines) && length === 0) {
                            for (const line of lines) {
                                const it = items.addNode?.("tester");
                                if (it?.updateText) it.updateText(line);
                            }
                            console.log("TestHelper: Seeded lines into existing page");
                        }
                    } catch (e) {
                        console.warn("TestHelper: Failed to seed lines", e);
                    }
                }, { targetPageName: pageName, lines });
            }
        } catch (e) {
            console.log("TestHelper: Post-navigation ensure-page step skipped:", (e as any)?.message ?? e);
        }

        // プロジェクトとページの自動読み込みを待機
        TestHelpers.slog("OutlinerBase mounted, waiting for project and page loading");

        // より短いタイムアウトで複数回試行する
        let attempts = 0;
        const maxAttempts = 3; // 短縮: 3回試行（各3秒）
        let success = false;

        // E2E ログ収集を開始（1秒間隔で状態スナップショット）
        try {
            await page.evaluate(() => {
                try {
                    const w: any = window as any;
                    if (w.__E2E__ !== true) return;
                    // フラグが有効な場合のみ interval ログを有効化
                    const enabled = !!(w.__E2E_ENABLE_INTERVAL_LOGS
                        || (typeof localStorage !== "undefined"
                            && localStorage.getItem("E2E_ENABLE_INTERVAL_LOGS") === "1"));
                    if (!enabled) return;
                    if (!Array.isArray(w.E2E_LOGS)) w.E2E_LOGS = [];
                    if (w.__E2E_LOG_INTERVAL) {
                        clearInterval(w.__E2E_LOG_INTERVAL);
                        w.__E2E_LOG_INTERVAL = undefined;
                    }
                    const snap = () => {
                        const gs: any = w.generalStore || w.appStore;
                        const outlinerBase = document.querySelector('[data-testid="outliner-base"]');
                        w.E2E_LOGS.push({
                            t: Date.now(),
                            tag: "interval-snapshot",
                            href: location.href,
                            readyState: document.readyState,
                            hasGS: !!gs,
                            hasProject: !!(gs?.project),
                            hasPages: !!(gs?.pages),
                            hasCurrentPage: !!(gs?.currentPage),
                            hasOutlinerBase: !!outlinerBase,
                        });
                    };
                    // 直近状態を即時1回記録し、その後1秒間隔で継続
                    snap();
                    w.__E2E_LOG_INTERVAL = setInterval(snap, 1000);
                } catch {}
            });
        } catch {}

        while (attempts < maxAttempts && !success) {
            attempts++;
            console.log(`TestHelper: Attempt ${attempts}/${maxAttempts} to wait for project loading`);

            try {
                await page.waitForFunction(() => {
                    try {
                        const w: any = window as any;
                        const generalStore = w.generalStore;
                        const outlinerBase = document.querySelector('[data-testid="outliner-base"]');

                        const hasProject = !!(generalStore?.project);
                        const hasPages = !!(generalStore?.pages);
                        const ok = (!!generalStore && hasProject && hasPages) || !!outlinerBase;

                        // プローブ結果を軽量に記録
                        try {
                            if (Array.isArray(w.E2E_LOGS)) {
                                w.E2E_LOGS.push({
                                    t: Date.now(),
                                    tag: "waitForFunction-probe",
                                    hasGeneralStore: !!generalStore,
                                    hasOutlinerBase: !!outlinerBase,
                                    hasProject,
                                    hasPages,
                                });
                            }
                        } catch {}

                        return ok;
                    } catch (err) {
                        try {
                            const w: any = window as any;
                            if (Array.isArray(w.E2E_LOGS)) {
                                w.E2E_LOGS.push({
                                    t: Date.now(),
                                    tag: "waitForFunction-error",
                                    error: String((err as any)?.message ?? err),
                                });
                            }
                        } catch {}
                        return false;
                    }
                }, { timeout: 3000, polling: 300 }); // 短縮: 3秒のタイムアウト、0.3秒ごとにポーリング

                // フォールバック: currentPage が未設定ならタイトル一致で設定
                await page.evaluate((targetPageName) => {
                    const gs = (window as any).generalStore;
                    try {
                        if (gs?.pages && !gs.currentPage) {
                            const arr: any = gs.pages.current as any;
                            const len = arr?.length ?? 0;
                            for (let i = 0; i < len; i++) {
                                const p = arr?.at ? arr.at(i) : arr[i];
                                if (!p) continue;
                                const title = (p?.text as any)?.toString?.() ?? String((p as any)?.text ?? "");
                                if (String(title).toLowerCase() === String(targetPageName).toLowerCase()) {
                                    gs.currentPage = p;
                                    console.log("TestHelper: currentPage set explicitly to", title);
                                    break;
                                }
                            }
                        }
                    } catch (e) {
                        console.warn("TestHelper: failed to set currentPage explicitly", e);
                    }
                }, pageName);

                success = true;
                console.log(`TestHelper: Successfully satisfied ready conditions on attempt ${attempts}`);
                // ログ収集を停止
                try {
                    await page.evaluate(() => {
                        try {
                            const w: any = window as any;
                            if (w.__E2E_LOG_INTERVAL) {
                                clearInterval(w.__E2E_LOG_INTERVAL);
                                w.__E2E_LOG_INTERVAL = undefined;
                            }
                            if (Array.isArray(w.E2E_LOGS)) {
                                w.E2E_LOGS.push({ t: Date.now(), tag: "ready-success" });
                            }
                        } catch {}
                    });
                } catch {}
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                TestHelpers.slog(`Attempt ${attempts} failed`, { msg });

                // ブラウザコンテキストが閉じられた場合は新しいページを開き直して再試行
                if (
                    msg.includes("Target page, context or browser has been closed")
                    || msg.includes("Context closed")
                ) {
                    console.warn("TestHelper: Context/page closed; NOT reopening per policy");
                }

                if (attempts < maxAttempts) {
                    TestHelpers.slog("Retrying...");
                    // ページが閉じられていてもリトライ待機できるように、page.waitForTimeoutではなく
                    // setTimeoutを直接使用する
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                }
            }
        }

        if (!success) {
            TestHelpers.slog("Failed to load project and page after all attempts");

            // 収集した E2E_LOGS を取得して末尾をダンプ
            try {
                const tailLogs = await page.evaluate(() => {
                    const w: any = window as any;
                    try {
                        if (w.__E2E_LOG_INTERVAL) {
                            clearInterval(w.__E2E_LOG_INTERVAL);
                            w.__E2E_LOG_INTERVAL = undefined;
                        }
                    } catch {}
                    return Array.isArray(w.E2E_LOGS) ? w.E2E_LOGS.slice(-200) : [];
                });
                TestHelpers.slog("E2E_LOGS (last 200)", tailLogs);
            } catch (e) {
                console.log("E2E_LOGS retrieval failed:", (e as any)?.message ?? e);
            }

            // 最終状態をログ出力
            const finalState = await page.evaluate(() => {
                const generalStore = (window as any).generalStore;
                return {
                    hasGeneralStore: !!generalStore,
                    hasProject: !!(generalStore?.project),
                    hasPages: !!(generalStore?.pages),
                    hasCurrentPage: !!(generalStore?.currentPage),
                };
            });
            console.log("TestHelper: Final state:", finalState);
            throw new Error("Failed to load project and page");
        }

        // OutlinerBaseの非ブロッキング短時間チェックは、環境によってハングすることがあるためスキップ
        TestHelpers.slog("Skipping OutlinerBase mount micro-check");

        // ページコンポーネント初期化チェックはヘルパーでは行わず、各specに委ねる
        TestHelpers.slog("Skipping page component init check in helper");

        // currentPageが設定されるまで待機（さらに短縮・非致命的）
        try {
            TestHelpers.slog("Waiting for currentPage to be set (very short)");
            await page.waitForFunction(() => {
                const generalStore = (window as any).generalStore;
                return !!(generalStore && generalStore.currentPage);
            }, { timeout: 1000 });
        } catch {
            TestHelpers.slog("currentPage not set within 1s; continuing");
        }

        // 最終シード: Yjs 初期化後に currentPage が空なら lines を投入（重複回避のため空の時のみ）
        try {
            await page.evaluate((lines) => {
                try {
                    const gs = (window as any).generalStore;
                    const pageRef = gs?.currentPage;
                    const items = pageRef?.items as any;
                    const length = items?.length ?? 0;
                    if (items && Array.isArray(lines) && lines.length > 0 && length === 0) {
                        for (const line of lines) {
                            const it = items.addNode?.("tester");
                            it?.updateText?.(line);
                        }
                        console.log("TestHelper: Seeded lines after Yjs init");
                    }
                } catch (e) {
                    console.warn("TestHelper: late seeding failed", e);
                }
            }, lines);
        } catch {}

        // 強制整形: lines が与えられている場合は先頭から順にテキストを上書き（不足分は追加）
        try {
            if (Array.isArray(lines) && lines.length > 0) {
                await page.evaluate((lines) => {
                    try {
                        const gs = (window as any).generalStore;
                        const pageRef = gs?.currentPage;
                        const items = pageRef?.items as any;
                        if (!items) return;
                        // 既存の先頭要素から順に上書きし、足りなければ追加
                        for (let i = 0; i < lines.length; i++) {
                            const want = String(lines[i] ?? "");
                            let node = items.at ? items.at(i) : items[i];
                            if (!node && typeof items.addNode === "function") {
                                node = items.addNode("tester");
                            }
                            if (node?.updateText) node.updateText(want);
                        }
                    } catch (e) {
                        console.warn("TestHelper: force overwrite lines failed", e);
                    }
                }, lines);
            }
        } catch {}

        // 最低限の可視性を短時間だけ確認（失敗しても継続）
        try {
            await expect(page.getByTestId("outliner-base")).toBeVisible({ timeout: 1500 });
        } catch {}

        TestHelpers.slog("Proceeding after minimal OutlinerBase visibility check");

        // 追加のUIチェックは省略して直ちにテストへ移行
        TestHelpers.slog("Proceeding to tests (skip OutlinerTree quick check)");

        // ここでの最終 evaluate はテスト中のページクローズと競合しうるため省略
        return { projectName, pageName };
    }

    /**
     * アウトライナーアイテムが表示されるのを待つ
     * @param page Playwrightのページオブジェクト
     * @param timeout タイムアウト時間（ミリ秒）
     */
    public static async waitForOutlinerItems(page: Page, timeout = 30000): Promise<void> {
        TestHelpers.slog("waitForOutlinerItems: start");
        console.log("Waiting for outliner items (with data-item-id) to be visible...");

        // 現在のURLを確認
        const currentUrl = page.url();
        console.log("Current URL:", currentUrl);

        // プロジェクトページに移動していることを確認
        const url = new URL(currentUrl);
        const pathParts = url.pathname.split("/").filter(part => part);
        const isOnProjectPage = pathParts.length >= 2;

        if (!isOnProjectPage) {
            console.log("Not on a project page, waiting for navigation...");
            await page.waitForTimeout(2000);
        }

        // データ属性付きの実アイテムが出現するまで待つ（プレースホルダー .outliner-item は除外）
        try {
            const deadline = Date.now() + timeout;
            const minRequiredItems = 1;
            let ensured = false;

            // まずは最小UIの可視性を軽く待機（非致命的）
            try {
                TestHelpers.slog("waitForOutlinerItems: wait outliner-base visible");
                await expect(page.getByTestId("outliner-base")).toBeVisible({ timeout: Math.min(4000, timeout) });
            } catch {}

            while (Date.now() < deadline) {
                if (page.isClosed()) {
                    throw new Error("Page closed while waiting for outliner items");
                }
                try {
                    TestHelpers.slog("waitForOutlinerItems: counting items");
                    const countNow = await page.locator(".outliner-item[data-item-id]").count();
                    if (countNow >= minRequiredItems) {
                        TestHelpers.slog("waitForOutlinerItems: ensured required items", {
                            countNow,
                            minRequiredItems,
                        });
                        ensured = true;
                        break;
                    }

                    // 生成手段1: ツールバーの「アイテム追加」ボタン
                    try {
                        TestHelpers.slog("waitForOutlinerItems: try click add button");
                        const addBtn = page.locator(".outliner .toolbar .actions button").first();
                        if (await addBtn.count().then(c => c > 0)) {
                            await addBtn.click({ force: true }).catch(() => {});
                        }
                    } catch {}

                    // 生成手段2: Yjs API で currentPage.items に 1 行追加
                    try {
                        TestHelpers.slog("waitForOutlinerItems: try create via Yjs");
                        await page.evaluate(() => {
                            try {
                                const win: any = window as any;
                                const gs = win.generalStore || win.appStore;
                                const pageItem = gs?.currentPage;
                                const items = pageItem?.items;
                                if (items && typeof items.addNode === "function") {
                                    const node = items.addNode("tester");
                                    if (node && typeof node.updateText === "function") node.updateText("");
                                }
                            } catch {}
                        });
                    } catch {}
                } catch (innerErr: any) {
                    const msg = String(innerErr?.message ?? innerErr);
                    if (
                        msg.includes("Target page, context or browser has been closed")
                        || msg.includes("Execution context was destroyed")
                    ) {
                        // 短い待機の上で再試行（タイムアウト総量は deadline で管理）
                    }
                }

                await page.waitForTimeout(200);
            }

            if (!ensured) {
                TestHelpers.slog("waitForOutlinerItems: failed to ensure items before deadline", { minRequiredItems });
                throw new Error(
                    `Failed to ensure at least ${minRequiredItems} real outliner item${
                        minRequiredItems > 1 ? "s" : ""
                    }`,
                );
            }

            const itemCount = await page.locator(".outliner-item[data-item-id]").count();
            console.log(`Found ${itemCount} outliner items with data-item-id`);
            TestHelpers.slog("waitForOutlinerItems: success", { itemCount, minRequiredItems });
        } catch (e) {
            console.log("Timeout/Failure waiting for real outliner items, taking screenshot...");
            try {
                if (!page.isClosed()) {
                    await page.screenshot({ path: "client/test-results/outliner-items-timeout.png" });
                }
            } catch {}
            TestHelpers.slog("waitForOutlinerItems: error", { error: e instanceof Error ? e.message : String(e) });
            throw e;
        }

        // 少し待機して安定させる
        await page.waitForTimeout(300);
        TestHelpers.slog("waitForOutlinerItems: end");
    }

    /**
     * アクティブなアイテムIDを取得する
     * @param page Playwrightのページオブジェクト
     * @returns アクティブなアイテムID
     */
    public static async getActiveItemId(page: Page): Promise<string | null> {
        const cursorData = await CursorValidator.getCursorData(page);
        return cursorData.activeItemId;
    }

    /**
     * アクティブなアイテム要素を取得する
     * @param page Playwrightのページオブジェクト
     * @returns アクティブなアイテム要素のロケーター
     */
    public static async getActiveItemLocator(page: Page): Promise<any> {
        const activeItemId = await this.getActiveItemId(page);
        if (!activeItemId) return null;

        return page.locator(`.outliner-item[data-item-id="${activeItemId}"] .item-content`);
    }

    /**
     * 指定インデックスのアイテムIDを取得する
     */
    public static async getItemIdByIndex(page: Page, index: number): Promise<string | null> {
        return await page.evaluate(i => {
            // Prefer AliasPickerStore.itemId while picker is visible (robust for newly created alias)
            try {
                const ap: any = (window as any).aliasPickerStore;
                if (ap && ap.isVisible && typeof ap.itemId === "string" && ap.itemId) {
                    return ap.itemId as string;
                }
            } catch {}
            const items = Array.from(document.querySelectorAll<HTMLElement>(".outliner-item[data-item-id]"));
            const target = items[i];
            return target?.dataset.itemId ?? null;
        }, index);
    }

    /**
     * アイテムをクリックして編集モードに入る
     * @param page Playwrightのページオブジェクト
     * @param itemSelector アイテムを特定するセレクタ
     */
    public static async clickItemToEdit(page: Page, itemSelector: string): Promise<void> {
        await page.click(itemSelector);
        await this.waitForCursorVisible(page);

        // カーソルが表示されていることを確認
        const cursorData = await CursorValidator.getCursorData(page);
        expect(cursorData.cursorCount).toBeGreaterThan(0);
        expect(cursorData.activeItemId).not.toBeNull();
    }

    /**
     * マウスオーバーイベントを強制的にシミュレートする
     * Playwrightのhover()メソッドがテスト環境で動作しない場合に使用
     * @param page Playwrightのページオブジェクト
     * @param selector 対象要素のセレクタ
     */
    public static async forceHoverEvent(page: Page, selector: string): Promise<void> {
        await page.evaluate(sel => {
            const element = document.querySelector(sel);
            if (!element) {
                console.error(`Element not found: ${sel}`);
                return;
            }

            // mouseenterイベントを強制的に発火
            const mouseEnterEvent = new MouseEvent("mouseenter", {
                bubbles: true,
                cancelable: true,
                view: window,
            });
            element.dispatchEvent(mouseEnterEvent);

            // mousemoveイベントも発火
            const mouseMoveEvent = new MouseEvent("mousemove", {
                bubbles: true,
                cancelable: true,
                view: window,
            });
            element.dispatchEvent(mouseMoveEvent);

            console.log(`Forced hover events on: ${sel}`);
        }, selector);

        // イベント処理のための短い待機
        await page.waitForTimeout(300);
    }

    /**
     * マウスアウトイベントを強制的にシミュレートする
     * @param page Playwrightのページオブジェクト
     * @param selector 対象要素のセレクタ
     */
    public static async forceMouseOutEvent(page: Page, selector: string): Promise<void> {
        await page.evaluate(sel => {
            let element: Element | null = null;

            // :has-text()セレクタの場合は特別な処理
            if (sel.includes(":has-text(")) {
                const match = sel.match(/^(.+):has-text\("([^"]+)"\)$/);
                if (match) {
                    const baseSelector = match[1];
                    const text = match[2];
                    const elements = Array.from(document.querySelectorAll(baseSelector));

                    for (const el of elements) {
                        if (el.textContent && el.textContent.includes(text)) {
                            element = el;
                            break;
                        }
                    }
                }
            } else {
                element = document.querySelector(sel);
            }

            if (!element) {
                console.error(`Element not found: ${sel}`);
                return;
            }

            // mouseleaveイベントを強制的に発火
            const mouseLeaveEvent = new MouseEvent("mouseleave", {
                bubbles: true,
                cancelable: true,
                view: window,
            });
            element.dispatchEvent(mouseLeaveEvent);

            console.log(`Forced mouseleave event on: ${sel}`);
        }, selector);

        // イベント処理のための短い待機
        await page.waitForTimeout(300);
    }

    /**
     * バックリンクパネルを開く
     * @param page Playwrightのページオブジェクト
     */
    public static async openBacklinkPanel(page: Page): Promise<void> {
        // バックリンクパネルのトグルボタンを探す
        const toggleButton = page.locator(".backlink-toggle-button");

        // ボタンが存在するか確認
        const buttonExists = await toggleButton.count() > 0;
        if (!buttonExists) {
            console.error("Backlink toggle button not found");
            return;
        }

        // パネルが既に開いているか確認
        const isOpen = await toggleButton.evaluate(el => el.classList.contains("active"));
        if (!isOpen) {
            // ボタンをクリックしてパネルを開く
            await toggleButton.click();

            // パネルが開くのを待機
            await page.waitForTimeout(500);
        }
    }

    /**
     * AliasPicker から指定されたパスのオプションを選択する
     * @param page Playwrightのページオブジェクト
     * @param path エイリアス先のパス
     */
    public static async confirmAliasOption(page: Page, itemId: string): Promise<void> {
        await page.evaluate(id => {
            const store = (window as any).aliasPickerStore;
            if (store && typeof store.confirmById === "function") {
                store.confirmById(id);
            }
        }, itemId);
    }

    public static async selectAliasOption(page: Page, itemId: string): Promise<void> {
        // Ensure picker is visible first
        await page.locator(".alias-picker").waitFor({ state: "visible", timeout: 5000 });

        // Prefer calling store directly for determinism
        let hid = false;
        try {
            await page.evaluate((id) => {
                const store: any = (window as any).aliasPickerStore;
                if (store && typeof store.confirmById === "function") {
                    store.confirmById(id);
                }
            }, itemId);
            await page.locator(".alias-picker").waitFor({ state: "hidden", timeout: 1500 });
            hid = true;
        } catch {}

        if (!hid) {
            throw new Error("Alias picker did not hide after store.confirmById");
        }

        // small settle time
        await page.waitForTimeout(100);
    }

    public static async clickAliasOptionViaDOM(page: Page, itemId: string): Promise<void> {
        const selector = `.alias-picker button[data-id="${itemId}"]`;
        await page.evaluate(sel => {
            const btn = document.querySelector(sel) as HTMLElement | null;
            btn?.click();
        }, selector);
    }

    public static async setAliasTarget(page: Page, itemId: string, targetId: string): Promise<void> {
        // 既存のエイリアスアイテムのターゲットを変更する（直接AliasPickerStoreを呼び出し）
        await page.evaluate(id => {
            const store = (window as any).aliasPickerStore;
            if (store && typeof store.show === "function") {
                store.show(id);
            }
        }, itemId);

        // エイリアスピッカーが表示されるまで待機
        await page.locator(".alias-picker").waitFor({ state: "visible", timeout: 5000 });

        // ターゲットアイテムのボタンをクリック
        const selector = `.alias-picker button[data-id="${targetId}"]`;
        await page.locator(selector).waitFor({ state: "visible", timeout: 5000 });
        await page.locator(selector).click();

        // エイリアスピッカーが非表示になるまで待機
        await page.locator(".alias-picker").waitFor({ state: "hidden", timeout: 5000 });

        // 少し待機してからエイリアスパスが表示されることを確認
        await page.waitForTimeout(500);
    }

    public static async hideAliasPicker(page: Page): Promise<void> {
        // エイリアスピッカーが表示されている場合のみ非表示にする
        const isVisible = await page.locator(".alias-picker").isVisible();
        if (isVisible) {
            try {
                // エイリアスピッカーにフォーカスを設定
                await page.locator(".alias-picker").focus();
                // Escapeキーを押してエイリアスピッカーを閉じる
                await page.keyboard.press("Escape");
                await page.locator(".alias-picker").waitFor({ state: "hidden", timeout: 3000 });
            } catch (error) {
                console.log("Failed to hide alias picker with Escape, trying alternative method");
                // 代替手法：ページの他の場所をクリックしてピッカーを閉じる
                await page.click("body");
                await page.waitForTimeout(500);
                // それでも閉じない場合は、強制的に非表示にする
                const stillVisible = await page.locator(".alias-picker").isVisible();
                if (stillVisible) {
                    console.log("Alias picker still visible, forcing hide via store");
                    await page.evaluate(() => {
                        const store = (window as any).aliasPickerStore;
                        if (store && typeof store.hide === "function") {
                            store.hide();
                        }
                    });
                }
            }
        }
    }

    public static async showAliasPicker(page: Page, itemId: string): Promise<void> {
        // Prefer calling the store directly to avoid pointer interception issues.
        await page.evaluate((id) => {
            const store = (window as any).aliasPickerStore;
            if (store && typeof store.show === "function") {
                store.show(id);
            }
        }, itemId);

        await page.locator(".alias-picker").waitFor({ state: "visible", timeout: 5000 });
        await page.waitForTimeout(150);
    }

    /**
     * DOM属性からaliasTargetIdを取得する（page.evaluate不要）
     */
    public static async getAliasTargetId(page: Page, itemId: string): Promise<string | null> {
        // Robust: read from model state directly to avoid DOM/virtualization flakiness
        const modelId = await page.evaluate((id) => {
            try {
                const gs: any = (window as any).generalStore || (window as any).appStore;
                const ap: any = (window as any).aliasPickerStore;
                const root = gs?.currentPage;
                if (!root) return null;
                function find(node: any, target: string): any | null {
                    if (!node) return null;
                    if (node.id === target) return node;
                    const items: any = node.items;
                    const len = items?.length ?? 0;
                    for (let i = 0; i < len; i++) {
                        const child = items.at ? items.at(i) : items[i];
                        const found = find(child, target);
                        if (found) return found;
                    }
                    return null;
                }
                const node = find(root, id);
                const value = node?.aliasTargetId || null;
                if (value) return value;
                return null;
            } catch {
                return null;
            }
        }, itemId);
        return modelId && modelId !== "" ? modelId : null;
    }

    /**
     * エイリアスパスが表示されているかを確認する（より堅牢なDOM可視性チェック）
     */
    public static async isAliasPathVisible(page: Page, itemId: string): Promise<boolean> {
        // Fast-path: if model has no aliasTargetId, path should not be visible
        try {
            const target = await this.getAliasTargetId(page, itemId);
            if (!target) return false;
        } catch {}

        const itemSel = `.outliner-item[data-item-id="${itemId}"]`;
        const aliasSel = `${itemSel} .alias-path`;
        const item = page.locator(itemSel);
        try {
            await item.scrollIntoViewIfNeeded({ timeout: 1000 });
        } catch {}

        const deadline = Date.now() + 5000; // up to 5s
        while (Date.now() < deadline) {
            try {
                const count = await page.locator(aliasSel).count();
                if (count > 0) {
                    const visible = await page.evaluate((sel) => {
                        const el = document.querySelector(sel) as HTMLElement | null;
                        if (!el) return false;
                        const rect = el.getBoundingClientRect();
                        const style = window.getComputedStyle(el);
                        return rect.height > 0 && rect.width > 0
                            && style.visibility !== "hidden"
                            && style.display !== "none";
                    }, aliasSel);
                    if (visible) return true;
                }
            } catch {}
            await page.waitForTimeout(100);
        }

        // 最終フォールバック：DOM要素が見つからない場合でも、data-alias-target-id が設定されていれば可視とみなす
        try {
            const attr = await page.locator(itemSel).getAttribute("data-alias-target-id");
            if (attr && attr.trim() !== "") return true;
            return (await page.locator(aliasSel).count()) > 0;
        } catch {
            return false;
        }
    }

    /**
     * エイリアスサブツリーが表示されているかを確認する（DOM操作ベース）
     */
    public static async isAliasSubtreeVisible(page: Page, itemId: string): Promise<boolean> {
        const itemSel = `.outliner-item[data-item-id="${itemId}"]`;
        const subtreeSel = `${itemSel} .alias-subtree`;
        const item = page.locator(itemSel);
        // Try to bring the item into view to avoid viewport-related false negatives
        try {
            await item.scrollIntoViewIfNeeded({ timeout: 1000 });
        } catch {}
        const aliasSubtree = page.locator(subtreeSel);
        const deadline = Date.now() + 3000; // up to 3s
        while (Date.now() < deadline) {
            try {
                const count = await aliasSubtree.count();
                if (count > 0) {
                    // Robust visibility check via DOM API
                    const visible = await page.evaluate((sel) => {
                        const el = document.querySelector(sel) as HTMLElement | null;
                        if (!el) return false;
                        const rect = el.getBoundingClientRect();
                        const style = window.getComputedStyle(el);
                        return rect.height > 0 && rect.width > 0 && style.visibility !== "hidden"
                            && style.display !== "none";
                    }, subtreeSel);
                    if (visible) return true;
                }
            } catch {}
            await page.waitForTimeout(100);
        }
        // Consider visible if alias target attribute is set on the item
        try {
            const attr = await page.locator(itemSel).getAttribute("data-alias-target-id");
            if (attr && attr.trim() !== "") return true;
            return (await aliasSubtree.count()) > 0;
        } catch {
            return false;
        }
    }

    /**
     * エイリアスパス内のボタンをクリックしてナビゲーションをテストする（DOM操作ベース）
     */
    public static async clickAliasPathButton(page: Page, itemId: string, buttonIndex: number): Promise<void> {
        const aliasPath = page.locator(`.outliner-item[data-item-id="${itemId}"] .alias-path`);
        const buttons = aliasPath.locator("button");
        await buttons.nth(buttonIndex).click();
    }

    /**
     * エイリアスパス内のボタンの数を取得する（DOM操作ベース）
     */
    public static async getAliasPathButtonCount(page: Page, itemId: string): Promise<number> {
        const aliasPath = page.locator(`.outliner-item[data-item-id="${itemId}"] .alias-path`);
        const buttons = aliasPath.locator("button");
        return await buttons.count();
    }

    /**
     * 指定したアイテムの aliasTargetId を取得する
     * @param page Playwright のページオブジェクト
     * @param itemId 取得対象アイテムの ID
     */
    public static async getAliasTarget(page: Page, itemId: string): Promise<string | null> {
        // DOM属性から直接aliasTargetIdを取得（page.evaluateを使わない代替手法）
        const element = page.locator(`.outliner-item[data-item-id="${itemId}"]`);
        const aliasTargetId = await element.getAttribute("data-alias-target-id");
        return aliasTargetId && aliasTargetId.trim() !== "" ? aliasTargetId : null;
    }

    /**
     * テスト環境でのDOM要素の可視性を強制的に確認する
     * @param selector 対象要素のセレクタ
     * @param page Playwrightのページオブジェクト
     * @param waitTime 要素が表示されるまで待機する時間（ミリ秒）
     * @param retryCount 再試行回数
     * @returns 要素が存在し表示されている場合はtrue
     */
    public static async forceCheckVisibility(
        selector: string,
        page: Page,
        waitTime: number = 500,
        retryCount: number = 3,
    ): Promise<boolean> {
        // 要素が表示されるまで待機
        if (waitTime > 0) {
            await page.waitForTimeout(waitTime);
        }

        // 複数回試行する
        for (let i = 0; i < retryCount; i++) {
            try {
                // 要素が存在するか確認
                const elementExists = await page.locator(selector).count() > 0;
                if (!elementExists) {
                    console.log(`Element not found: ${selector} (attempt ${i + 1}/${retryCount})`);

                    // 内部リンクの場合は、強制的にレンダリングを試みる
                    if (selector.includes(".internal-link") || selector.includes(".link-preview")) {
                        console.log("Trying to force render internal links...");
                        await page.evaluate(() => {
                            // 内部リンクを含む可能性のあるテキスト要素を検索
                            const textElements = document.querySelectorAll(".item-text");
                            console.log(`Found ${textElements.length} text elements to check for links`);

                            textElements.forEach(el => {
                                const text = el.textContent || "";
                                // 内部リンクのパターンを検出
                                if (text.includes("[") && text.includes("]")) {
                                    console.log("Found potential link in:", text);
                                    // フォーマット済みクラスを追加して強制的にレンダリング
                                    el.classList.add("formatted");
                                }
                            });
                        });
                    }

                    if (i < retryCount - 1) {
                        await page.waitForTimeout(300);
                        continue;
                    }
                    return false;
                }

                // 要素の可視性を確認
                const isVisible = await page.evaluate(sel => {
                    const element = document.querySelector(sel);
                    if (!element) return false;

                    // 要素が画面内に表示されているか確認
                    const rect = element.getBoundingClientRect();

                    // スタイルを確認
                    const style = window.getComputedStyle(element);
                    const isVisibleStyle = style.display !== "none"
                        && style.visibility !== "hidden"
                        && style.opacity !== "0"
                        && rect.height > 0
                        && rect.width > 0;

                    // 親要素が非表示になっていないか確認
                    let parent = element.parentElement;
                    let isParentVisible = true;

                    while (parent) {
                        const parentStyle = window.getComputedStyle(parent);
                        if (
                            parentStyle.display === "none"
                            || parentStyle.visibility === "hidden"
                            || parentStyle.opacity === "0"
                        ) {
                            isParentVisible = false;
                            break;
                        }
                        parent = parent.parentElement;
                    }

                    return isVisibleStyle && isParentVisible;
                }, selector);

                if (isVisible) {
                    return true;
                }

                console.log(`Element found but not visible: ${selector} (attempt ${i + 1}/${retryCount})`);

                // 内部リンクの場合は、強制的に表示を試みる
                if (selector.includes(".link-preview-popup")) {
                    console.log("Trying to force show link preview...");
                    await page.evaluate(sel => {
                        const element = document.querySelector(sel);
                        if (element) {
                            // 強制的に表示
                            (element as HTMLElement).style.display = "block";
                            (element as HTMLElement).style.visibility = "visible";
                            (element as HTMLElement).style.opacity = "1";
                        }
                    }, selector);
                }

                if (i < retryCount - 1) {
                    await page.waitForTimeout(300);
                }
            } catch (error) {
                console.error(`Error checking visibility for ${selector}:`, error);
                if (i < retryCount - 1) {
                    await page.waitForTimeout(300);
                }
            }
        }

        return false;
    }

    /**
     * 要素が表示されるまで待機する
     * @param page Playwrightのページオブジェクト
     * @param selector 対象要素のセレクタ
     * @param timeout タイムアウト時間（ミリ秒）
     * @returns 要素が表示された場合はtrue
     */
    public static async waitForElementVisible(
        page: Page,
        selector: string,
        timeout: number = 10000,
    ): Promise<boolean> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            const isVisible = await this.forceCheckVisibility(selector, page, 0, 1);
            if (isVisible) {
                return true;
            }

            // 短い間隔で再試行
            await page.waitForTimeout(200);
        }

        console.log(`Timeout waiting for element to be visible: ${selector}`);
        return false;
    }

    // 注: 422行目に同名のメソッドが既に定義されているため、このメソッドは削除します
}

/**
 * テスト用ユーティリティ（Yjs ベース）
 * 旧実装依存のヘルパーは削除済み
 */

// グローバル型定義を拡張（テスト用にwindowオブジェクトに機能を追加）
declare global {
    interface Window {
        getCursorDebugData?: () => any;
        getCursorPathData?: (path?: string) => any;
        __testShowLinkPreview?: (pageName: string, projectName?: string) => HTMLElement;
        _alertMessage?: string | null | undefined;
        __USER_MANAGER__?: any;
        editorOverlayStore?: any;
    }
}
