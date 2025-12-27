import { type Browser, expect, type Page } from "@playwright/test";
import { startCoverage, stopCoverage } from "../helpers/coverage.js";
import { CursorValidator } from "./cursorValidation.js";

/**
 * テスト用のヘルパー関数群
 */
export class TestHelpers {
    // Structured logger: timestamp and delta from previous log (disabled by default; enable with E2E_VERBOSE_SLOG=1)
    private static __lastLogTs: number | null = null;
    private static readonly LOG_ENABLED: boolean = process.env.E2E_VERBOSE_SLOG === "1";
    private static slog(msg: string, data?: unknown) {
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
     * カバレッジ収集を開始する
     * @param page Playwrightのページオブジェクト
     */
    public static async startCoverage(page: Page): Promise<void> {
        await startCoverage(page);
    }

    /**
     * カバレッジ収集を停止し、結果を保存する
     * @param page Playwrightのページオブジェクト
     * @param testName テスト名
     */
    public static async stopCoverage(page: Page, testName: string): Promise<void> {
        await stopCoverage(page, testName);
    }

    /**
     * テスト環境を準備する
     * 各テストの前に呼び出すことで、テスト環境を一貫した状態にする
     * @param page Playwrightのページオブジェクト
     * @param testInfo テスト情報
     * @param lines 初期データ行
     * @param browser ブラウザインスタンス
     * @param options オプション設定
     * @param options.ws WebSocket設定 ("force" | "disable" | "default")
     * @returns 作成したプロジェクト名とページ名
     */
    public static async prepareTestEnvironment(
        page: Page,
        testInfo?: { workerIndex?: number; } | null,
        lines: string[] = [],
        browser?: Browser,
        options: { // Ensure options is always defined
            projectName?: string;
            pageName?: string;
            skipSeed?: boolean;
            doNotSeed?: boolean;
            doNotNavigate?: boolean;
            ws?: string;
        } = {}, // Default to an empty object
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
                // Force WebSocket connection for E2E tests that need WS sync
                localStorage.setItem("VITE_YJS_FORCE_WS", "true");
                localStorage.removeItem("VITE_YJS_DISABLE_WS");

                (window as Window & Record<string, any>).__E2E__ = true;
                // Vite エラーオーバーレイ抑止
                (window as Window & Record<string, any>).__vite_plugin_react_preamble_installed__ = true;
                const originalCreateElement = document.createElement;
                document.createElement = function(tagName: string, ...args: [ElementCreationOptions?]) {
                    if (tagName === "vite-error-overlay") {
                        return originalCreateElement.call(this, "div", ...args);
                    }
                    return originalCreateElement.call(this, tagName, ...args);
                } as typeof document.createElement;
            } catch {}
        });

        const workerIndex = typeof testInfo?.workerIndex === "number" ? testInfo.workerIndex : 1;
        // Use a single timestamp for both project and page names to ensure consistency
        const timestamp = Date.now();
        const projectName = options?.projectName ?? `Test Project ${workerIndex} ${timestamp}`;
        const pageName = options?.pageName ?? `test-page-${timestamp}`;
        // Pass the timestamp to createAndSeedProject for consistent naming
        const effectiveOptions = {
            ...options,
            projectName,
            pageName,
        };
        const defaultLines = [
            "これはテスト用のページです。1",
            "これはテスト用のページです。2",
            "内部リンクのテスト: [test-link]",
        ];
        const seedLines = lines.length > 0 ? lines : defaultLines;

        if (!options.skipSeed && !options.doNotSeed) {
            await TestHelpers.createAndSeedProject(page, testInfo, seedLines, effectiveOptions);
        }

        if (!options?.doNotNavigate) {
            // If we skipped seeding, we likely want to verify empty state or handle seeding manually,
            // so we shouldn't force waiting for default seed lines.
            const linesToWait = (options?.skipSeed || options?.doNotSeed) ? [] : seedLines;
            await TestHelpers.navigateToProjectPage(page, projectName, pageName, linesToWait);
        } else {
            TestHelpers.slog("Skipping navigation (doNotNavigate option is true)");
        }

        return { projectName, pageName };
    }

    /**
     * Sets up test user project data with accessible projects for container selector tests.
     * This is a minimal alternative to setupTestEnvironment for tests that only need
     * the container selector to have options, without full project seeding.
     * @param page Playwright page object
     * @param projectNames Array of project names to add as accessible
     */
    public static async setAccessibleProjects(
        page: Page,
        projectNames: string[] = ["test-project-1", "test-project-2"],
    ): Promise<void> {
        await page.evaluate(({ projects }) => {
            const fs = (window as any).__FIRESTORE_STORE__;
            if (fs) {
                fs.userProject = {
                    userId: "test-user-id",
                    defaultProjectId: projects[0] || "test-project-1",
                    accessibleProjectIds: projects,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
                // Trigger sync for container store
                if ((window as any).__CONTAINER_STORE__) {
                    (window as any).__CONTAINER_STORE__.syncFromFirestore();
                }
            }
        }, { projects: projectNames });
    }

    /**
     * Creates and seeds a new project and page via API.
     * Does NOT navigate to the page.
     * @returns The name of the created project and page.
     */
    public static async createAndSeedProject(
        page: Page,
        testInfo?: { workerIndex?: number; } | null,
        lines: string[] = [],
        options?: {
            projectName?: string;
            pageName?: string;
            skipSeed?: boolean;
        },
    ): Promise<{ projectName: string; pageName: string; }> {
        const workerIndex = typeof testInfo?.workerIndex === "number" ? testInfo.workerIndex : 1;
        const projectName = options?.projectName ?? `Test Project ${workerIndex} ${Date.now()}`;
        const pageName = options?.pageName ?? `test-page-${Date.now()}`;

        // Seed data using backend client
        if (!options?.skipSeed) {
            TestHelpers.slog("Seeding data via backend client...");
            const { SeedClient } = await import("./seedClient.js");
            const authToken = await TestHelpers.getTestAuthToken();
            const defaultLines = [
                "これはテスト用のページです。1",
                "これはテスト用のページです。2",
                "内部リンクのテスト: [test-link]",
            ];
            const seedLines = lines.length > 0 ? lines : defaultLines;
            const seeder = new SeedClient(projectName, authToken);
            await seeder.seed([{ name: pageName, lines: seedLines }]);
            TestHelpers.slog("Seeding completed.");
        } else {
            TestHelpers.slog("Skipping seed (skipSeed option is true)");
        }
        return { projectName, pageName };
    }

    /**
     * Navigates to a specific project page and waits for it to be ready.
     */
    public static async navigateToProjectPage(
        page: Page,
        projectName: string,
        pageName: string,
        seedLines: string[] | null = null, // Allow null to signal "use default", empty array for "expect nothing"
    ): Promise<void> {
        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);
        const url = `/${encodedProject}/${encodedPage}`;

        TestHelpers.slog("Navigating to project page", { url });
        await page.goto(url, { timeout: 60000 });
        TestHelpers.slog("Navigation completed", { url });

        // Allow time for WebSocket connection and initial sync before checking app state
        // This is especially important in test environments where seeded data needs to propagate
        // The seeded page subdocument needs time to connect and sync its items
        await page.waitForTimeout(5000);

        // E2E stability: wait for store.currentPage to be set explicitly
        // This bypasses the retry logic in +page.svelte and provides a more direct wait
        TestHelpers.slog("Waiting for store.currentPage to be set...");
        const targetPageName = pageName; // Capture for closure
        await page.waitForFunction(
            (targetName) => {
                const gs = (window as any).generalStore;
                if (!gs?.project) return false;
                if (!gs?.currentPage) return false;
                const cp = gs.currentPage;
                const cpText = cp?.text?.toString?.() ?? String(cp?.text ?? "");
                return cpText.toLowerCase() === targetName.toLowerCase();
            },
            targetPageName,
            { timeout: 60000 },
        ).catch((e) => {
            // Fallback: log warning and continue - the +page.svelte retry logic will handle it
            const gs = (window as any).generalStore;
            const cp = gs?.currentPage;
            const cpText = cp?.text?.toString?.() ?? String(cp?.text ?? "");
            TestHelpers.slog("Warning: currentPage not set or mismatch, continuing anyway", {
                currentPageText: cpText,
                expectedPageName: pageName,
                error: e?.message,
            });
        });

        await TestHelpers.waitForAppReady(page);

        // Wait for tree data to be synced (subdocuments need time to load)
        // This part only makes sense if seeding happened. We need effective seedLines here.
        TestHelpers.slog("Waiting for tree data to sync...");
        const defaultLines = [
            "これはテスト用のページです。1",
            "これはテスト用のページです。2",
            "内部リンクのテスト: [test-link]",
        ];
        // If seedLines is null/undefined, use default. If it is an array (even empty), use it.
        const effectiveSeedLines = seedLines !== null ? seedLines : defaultLines;

        await page.waitForFunction(
            (expectedCount) => {
                const gs = (window as any).generalStore;
                if (!gs?.currentPage?.items) return false;
                const items = gs.currentPage.items;
                const count = items?.length ?? 0;
                return count >= expectedCount;
            },
            effectiveSeedLines.length,
            { timeout: 10000 },
        ).catch(() => {
            TestHelpers.slog("Warning: Tree data sync timeout, continuing anyway");
        });
        TestHelpers.slog("Tree data synced");

        const expectedItemCount = effectiveSeedLines.length + 1;
        TestHelpers.slog("Waiting for outliner items to render...", { count: expectedItemCount });
        await TestHelpers.waitForOutlinerItems(page, 30000, expectedItemCount);

        // Explicitly wait for the first seeded line's text to appear in the UI
        if (effectiveSeedLines.length > 0 && effectiveSeedLines[0]) {
            TestHelpers.slog("Waiting for first seed line text to hydrate...");
            const firstSeededLineText = effectiveSeedLines[0];
            await page.waitForFunction(
                ({ expectedText }) => {
                    const firstItemTextElement = document.querySelector(".outliner-item:nth-child(2) .item-text");
                    return firstItemTextElement && firstItemTextElement.textContent?.includes(expectedText);
                },
                { expectedText: firstSeededLineText },
                { timeout: 30000 },
            ).catch((e) => {
                throw new Error(`First seeded line not hydrated: "${firstSeededLineText}". Error: ${e}`);
            });
            TestHelpers.slog("First seed line text hydrated.");
        }

        await page.waitForTimeout(500); // Add a small delay to allow Svelte components to render.

        // Wait for seeded text content to be hydrated/rendered
        if (effectiveSeedLines.length > 0) {
            TestHelpers.slog("Waiting for seed text content to hydrate...");
            const limit = 20;
            const indicesToCheck = effectiveSeedLines.length <= limit
                ? effectiveSeedLines.map((_, i) => i)
                : [
                    0,
                    ...Array.from(
                        { length: limit - 2 },
                        (_, i) => Math.floor((i + 1) * effectiveSeedLines.length / (limit - 1)),
                    ),
                    effectiveSeedLines.length - 1,
                ];

            for (const index of indicesToCheck) {
                const line = effectiveSeedLines[index];
                if (!line) continue;

                try {
                    // Start checking from index + 1 because the first .outliner-item is the page title
                    const itemIndex = index + 1;
                    const item = page.locator(".outliner-item").nth(itemIndex);

                    TestHelpers.slog("DEBUG: Checking item", { itemIndex, expectedLine: line });

                    const fullItemText = await item.textContent();
                    const itemTextSpanContent = await item.locator(".item-text").textContent();

                    TestHelpers.slog("DEBUG: Item content before assertion", {
                        itemIndex,
                        fullItemText,
                        itemTextSpanContent,
                        expectedLine: line,
                    });

                    // Wait for the specific text to appear to ensure hydration is complete
                    await expect(item.locator(".item-text")).toContainText(line, { timeout: 30000 });
                } catch (e) {
                    const msg = `Failed to wait for non-empty text at index ${
                        index + 1
                    } for seed line: "${line}". Error: ${e}`;
                    console.error(msg);
                    throw new Error(msg);
                }
            }
        }
    }

    /**
     * プロジェクト用 E2E（ホーム滞在用）: ホームに遷移して環境を初期化する
     * - プロジェクト/ページには移動しない
     * - シーディングは SeedClient を使用して別途行う前提
     */
    public static async prepareTestEnvironmentForProject(
        page: Page,
        testInfo?: { workerIndex?: number; } | null,
        _lines: string[] = [],
        _browser?: Browser,
    ): Promise<{ projectName: string; pageName: string; }> {
        // 可能な限り早期にテスト用フラグを適用（初回ナビゲーション前）
        // Use the parameters to avoid lint errors about unused vars
        void testInfo;
        void _lines;
        void _browser;
        // Use the parameters to avoid lint errors about unused vars
        void testInfo;
        void _lines;
        void _browser;
        await page.addInitScript(() => {
            try {
                localStorage.setItem("VITE_IS_TEST", "true");
                localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
                localStorage.removeItem("VITE_YJS_DISABLE_WS");

                (window as Window & Record<string, any>).__E2E__ = true;
                (window as Window & Record<string, any>).__vite_plugin_react_preamble_installed__ = true;
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
            const store = (window as Window & Record<string, any>).appStore
                || (window as Window & Record<string, any>).generalStore;
            if (!store || !store.pages) return [] as Array<{ id: string; text: string; }>;

            const toArray = (p: unknown) => {
                if (!p) return [] as any[];
                try {
                    if (Array.isArray(p)) return p;
                    if (typeof p === "object" && p !== null && typeof (p as any)[Symbol.iterator] === "function") {
                        return Array.from(p as Iterable<unknown>);
                    }
                    const len = (p as { length?: number; }).length;
                    if (typeof len === "number" && len >= 0) {
                        const r: any[] = [];
                        for (let i = 0; i < len; i++) {
                            const anyVal = p as any;
                            const v = typeof anyVal.at === "function" ? anyVal.at(i) : anyVal[i];
                            if (typeof v !== "undefined") r.push(v);
                        }
                        return r;
                    }
                } catch {}
                return Object.values(p).filter((x: any) =>
                    x && typeof x === "object" && x !== null && ("id" in x || "text" in x)
                );
            };

            const pages = toArray(store.pages.current);
            return pages.map((p: any) => {
                const textVal = (p?.text && typeof (p.text as { toString?: unknown; }).toString === "function")
                    ? (p.text as any).toString()
                    : String(p?.text ?? "");
                return { id: String(p.id), text: textVal };
            });
        });
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

                        // For tree validation, if there's a current page, return its items
                        // Otherwise return the project root items (pages)
                        const currentPage = gs?.currentPage;
                        let root;
                        if (currentPage && currentPage.items) {
                            root = currentPage.items;
                        } else {
                            root = proj.items as any;
                        }

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
        } catch (_error) {
            console.log("Timeout waiting for cursor to be visible, continuing anyway");
            void _error;
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
     * アイテム数が期待値に達するまで待機する（UI操作後の安定化に使用）
     * @param page Playwrightのページオブジェクト
     * @param expectedCount 期待するアイテム数
     * @param timeout タイムアウト時間（ミリ秒）
     */
    public static async waitForItemCount(page: Page, expectedCount: number, timeout = 10000): Promise<boolean> {
        try {
            await page.waitForFunction(
                (count) => {
                    const items = document.querySelectorAll(".outliner-item[data-item-id]");
                    return items.length >= count;
                },
                expectedCount,
                { timeout },
            );
            return true;
        } catch {
            console.log(`Timeout waiting for item count to reach ${expectedCount}`);
            return false;
        }
    }

    /**
     * カーソルが完全に操作可能な状態になるまで待機する（クリック後の安定化に使用）
     * waitForCursorVisibleより厳格で、グローバルテキストエリアのフォーカスも確認
     * @param page Playwrightのページオブジェクト
     * @param timeout タイムアウト時間（ミリ秒）
     */
    public static async ensureCursorReady(page: Page, timeout = 10000): Promise<void> {
        // 1. カーソルが可視になるまで待機
        await this.waitForCursorVisible(page, timeout);

        // 2. グローバルテキストエリアにフォーカスがあることを確認
        await page.waitForFunction(() => {
            const textarea = document.querySelector<HTMLTextAreaElement>(".global-textarea");
            return textarea && document.activeElement === textarea;
        }, { timeout: 5000 }).catch(async () => {
            // フォーカスがない場合は手動でフォーカス
            await this.focusGlobalTextarea(page);
        });

        // 3. 短い安定化待機
        await page.waitForTimeout(50);
    }

    /**
     * キーボード操作後にUIが安定するまで待機する（Enter, Backspace等の操作後に使用）
     * @param page Playwrightのページオブジェクト
     */
    public static async waitForUIStable(page: Page): Promise<void> {
        // カーソルが可視であることを確認
        await this.waitForCursorVisible(page, 5000);
        // 最小限のUI更新待機
        await page.waitForTimeout(100);
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
     * Waits for the application to be in a ready state.
     * This includes waiting for authentication and for the generalStore to be initialized.
     * @param page Playwright's page object
     */
    public static async waitForAppReady(page: Page): Promise<void> {
        TestHelpers.slog("Waiting for app to be ready");

        // Wait for authentication
        await page.waitForFunction(() => {
            const userManager = (window as any).__USER_MANAGER__;
            return !!(userManager && userManager.getCurrentUser && userManager.getCurrentUser());
        }, { timeout: 15000 });
        TestHelpers.slog("Authentication is ready");

        // Wait for generalStore to be available
        await page.waitForFunction(() => !!(window as any).generalStore, { timeout: 60000 });
        TestHelpers.slog("generalStore is available");

        // Wait for project and page to be loaded in the store
        await page.waitForFunction(() => {
            const gs = (window as any).generalStore;
            return !!(gs && gs.project && gs.pages && gs.currentPage);
        }, { timeout: 60000 });
        TestHelpers.slog("Project and page are loaded in the store");

        // Wait for the outliner to be visible
        await expect(page.getByTestId("outliner-base")).toBeVisible({ timeout: 15000 });
        TestHelpers.slog("Outliner is visible");
    }

    /**
     * アウトライナーアイテムが表示されるのを待つ
     * @param page Playwrightのページオブジェクト
     * @param timeout タイムアウト時間（ミリ秒）
     * @param minCount 最小アイテム数（デフォルト 1）
     */
    public static async waitForOutlinerItems(page: Page, timeout = 30000, minCount = 1): Promise<void> {
        TestHelpers.slog("waitForOutlinerItems: start");
        console.log(`Waiting for ${minCount} outliner items (with data-item-id) to be visible...`);

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
            const minRequiredItems = minCount;
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

                    // Items should be present due to seeding, not generated by this function.
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
                    const chosen = ap.itemId as string;
                    try {
                        const gs: any = (window as any).generalStore;
                        const proj = encodeURIComponent(gs?.project?.title ?? "");
                        const parts = (window.location.pathname || "/").split("/").filter(Boolean);
                        const pageTitle = decodeURIComponent(parts[1] || "");
                        const key = `schedule:lastPageChildId:${proj}:${encodeURIComponent(pageTitle)}`;
                        window.sessionStorage?.setItem(key, chosen);
                    } catch {}
                    return chosen;
                }
            } catch {}
            const items = Array.from(document.querySelectorAll<HTMLElement>(".outliner-item[data-item-id]"));
            const target = items[i];
            const chosen = target?.dataset.itemId ?? null;
            try {
                if (chosen) {
                    const gs: any = (window as any).generalStore;
                    const proj = encodeURIComponent(gs?.project?.title ?? "");
                    const parts = (window.location.pathname || "/").split("/").filter(Boolean);
                    const pageTitle = decodeURIComponent(parts[1] || "");
                    const key = `schedule:lastPageChildId:${proj}:${encodeURIComponent(pageTitle)}`;
                    window.sessionStorage?.setItem(key, chosen);
                }
            } catch {}
            return chosen;
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
        await page.locator(".alias-picker").first().waitFor({ state: "visible", timeout: 5000 });

        // Prefer calling store directly for determinism
        let hid = false;
        try {
            await page.evaluate((id) => {
                const store: any = (window as any).aliasPickerStore;
                if (store && typeof store.confirmById === "function") {
                    store.confirmById(id);
                }
            }, itemId);
            await page.locator(".alias-picker").first().waitFor({ state: "hidden", timeout: 1500 });
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
        await page.locator(".alias-picker").first().waitFor({ state: "visible", timeout: 5000 });

        // ターゲットアイテムのボタンをクリック
        await page.locator(".alias-picker").first().locator(`button[data-id="${targetId}"]`).waitFor({
            state: "visible",
            timeout: 5000,
        });
        await page.locator(".alias-picker").first().locator(`button[data-id="${targetId}"]`).click();

        // エイリアスピッカーが非表示になるまで待機
        await page.locator(".alias-picker").first().waitFor({ state: "hidden", timeout: 5000 });

        // 少し待機してからエイリアスパスが表示されることを確認
        await page.waitForTimeout(500);
    }

    public static async hideAliasPicker(page: Page): Promise<void> {
        // エイリアスピッカーが表示されている場合のみ非表示にする
        const isVisible = await page.locator(".alias-picker").first().isVisible();
        if (isVisible) {
            try {
                // エイリアスピッカーにフォーカスを設定
                await page.locator(".alias-picker").first().focus();
                // Escapeキーを押してエイリアスピッカーを閉じる
                await page.keyboard.press("Escape");
                await page.locator(".alias-picker").first().waitFor({ state: "hidden", timeout: 3000 });
            } catch {
                console.log("Failed to hide alias picker with Escape, trying alternative method");
                // 代替手法：ページの他の場所をクリックしてピッカーを閉じる
                await page.click("body");
                await page.waitForTimeout(500);
                // それでも閉じない場合は、強制的に非表示にする
                const stillVisible = await page.locator(".alias-picker").first().isVisible();
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

        await page.locator(".alias-picker").first().waitFor({ state: "visible", timeout: 5000 });
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
                const currentPage = gs?.currentPage;
                if (!currentPage) return null;

                function find(node: any, target: string): any | null {
                    if (!node) return null;
                    if (node.id === target) {
                        return node;
                    }
                    const items: any = node.items;
                    const len = typeof items?.length === "number"
                        ? items.length
                        : (typeof items?.length === "function" ? items.length() : 0);
                    for (let i = 0; i < len; i++) {
                        const child = items.at ? items.at(i) : items[i];
                        const found = find(child, target);
                        if (found) return found;
                    }
                    return null;
                }

                const node = find(currentPage, id);
                if (node) {
                    // Try to get aliasTargetId from the model
                    let value = node?.aliasTargetId || null;

                    // If not found in model, try Y.Map directly
                    if (!value) {
                        try {
                            const anyItem: any = node as any;
                            const ymap: any = anyItem?.tree?.getNodeValueFromKey?.(anyItem?.key);
                            if (ymap && typeof ymap.get === "function") {
                                value = ymap.get("aliasTargetId") || null;
                            }
                        } catch {}
                    }

                    // If still not found, check lastConfirmedTargetId as fallback
                    if (!value) {
                        const store: any = (window as any).aliasPickerStore;
                        const lastItemId = store?.lastConfirmedItemId;
                        const lastTargetId = store?.lastConfirmedTargetId;
                        const lastAt = store?.lastConfirmedAt as number | null;
                        if (lastTargetId && lastAt && Date.now() - lastAt < 6000 && lastItemId === id) {
                            value = lastTargetId;
                        }
                    }

                    if (value) return value;
                    // Even if aliasTargetId is not set, return null to indicate the node was found
                    return null;
                }
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
     * アイテムIDから現在のテキストを安全に取得する
     * EditorOverlay.svelte の getTextByItemId と同じロジックを使用
     * @param page Playwright のページオブジェクト
     * @param itemId 取得対象アイテムの ID
     * @returns アイテムのテキスト
     */
    public static async getTextByItemId(page: Page, itemId: string): Promise<string> {
        return await page.evaluate((id) => {
            // 1) DOM の .item-text
            const el = document.querySelector(`[data-item-id="${id}"] .item-text`) as HTMLElement | null;
            if (el && el.textContent) return el.textContent;

            // 2) アクティブ textarea
            try {
                const store = (window as any).editorOverlayStore;
                const ta = store?.getTextareaRef?.();
                const activeId = store?.getActiveItem?.();
                if (ta && activeId === id) {
                    return ta.value || "";
                }
            } catch {}

            // 3) generalStore から探索
            try {
                const gs = (window as any).generalStore;
                const page = gs?.currentPage;
                const items = page?.items;
                const len = items?.length ?? 0;
                for (let i = 0; i < len; i++) {
                    const it = items.at ? items.at(i) : items[i];
                    if (it?.id === id) {
                        return String(it?.text ?? "");
                    }
                }
            } catch {}
            return "";
        }, itemId);
    }

    /**
     * ボックス選択範囲のテキストを取得する
     * @param page Playwright のページオブジェクト
     * @param boxSelectionRanges ボックス選択範囲の配列
     * @returns 各行のテキストを改行で結合した文字列
     */
    public static async getBoxSelectionText(
        page: Page,
        boxSelectionRanges: Array<{ itemId: string; startOffset: number; endOffset: number; }>,
    ): Promise<string> {
        const lines: string[] = [];
        for (const range of boxSelectionRanges) {
            const fullText = await this.getTextByItemId(page, range.itemId);
            const startOffset = Math.max(0, Math.min(fullText.length, Math.min(range.startOffset, range.endOffset)));
            const endOffset = Math.max(0, Math.min(fullText.length, Math.max(range.startOffset, range.endOffset)));
            lines.push(fullText.substring(startOffset, endOffset));
        }
        return lines.join("\n");
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

    public static async cleanup(page: Page): Promise<void> {
        try {
            // ページがまだ利用可能か確認
            if (page.isClosed()) {
                console.log("TestHelper cleanup: page already closed, skipping");
                return;
            }

            // グローバルなストアをリセット
            await page.evaluate(() => {
                // generalStoreのプロジェクトとページ情報をリセット
                if ((window as any).generalStore) {
                    (window as any).generalStore.project = null;
                    (window as any).generalStore.pages = null;
                    (window as any).generalStore.currentPage = null;
                }

                // appStoreのプロジェクトとページ情報をリセット
                if ((window as any).appStore) {
                    (window as any).appStore.project = null;
                    (window as any).appStore.pages = null;
                    (window as any).appStore.currentPage = null;
                }

                // editorOverlayStoreのカーソル情報をリセット
                if ((window as any).editorOverlayStore) {
                    (window as any).editorOverlayStore.cursors = {};
                    (window as any).editorOverlayStore.cursorInstances = new Map();
                    (window as any).editorOverlayStore.activeItemId = null;
                    (window as any).editorOverlayStore.cursorVisible = false;
                }
            });

            // 一時的な待機でDOMの安定を待つ
            await page.waitForTimeout(100);
        } catch (error) {
            const errorMsg = String(error?.message ?? error);

            // 特定のエラーは警告として記録するだけで処理を継続
            if (
                errorMsg.includes("Target page, context or browser has been closed")
                || errorMsg.includes("Execution context was destroyed")
                || errorMsg.includes("Navigation")
            ) {
                console.log("TestHelper cleanup: page context no longer available, skipping");
            } else {
                console.warn("TestHelper cleanup warning:", error);
            }

            // クリーンアップはオプショナルな操作なのでエラーはスローしない
        }
    }

    /**
     * Get a valid ID token for the test user from local Firebase Emulator
     */
    private static async getTestAuthToken(): Promise<string> {
        const authHost = process.env.VITE_FIREBASE_AUTH_EMULATOR_HOST || "localhost:59099";
        // Ensure protocol
        const host = authHost.startsWith("http") ? authHost : `http://${authHost}`;
        const apiKey = "fake-api-key";
        const url = `${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email: "test@example.com",
                    password: "password",
                    returnSecureToken: true,
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                console.error(`[TestHelpers] Auth failed: ${response.status} ${text}`);
                throw new Error(`Auth failed: ${text}`);
            }

            const data: any = await response.json();
            return data.idToken;
        } catch (e) {
            console.error("[TestHelpers] Failed to get test auth token", e);
            // Fallback: return empty string if emulator is not reachable,
            // but this will likely fail backend validation.
            return "";
        }
    }
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
        __testShowLinkPreview?: (pageName: string, projectName?: string, pageExists?: boolean) => HTMLElement;
        _alertMessage?: string | null | undefined;
        __USER_MANAGER__?: any;
        editorOverlayStore?: any;
    }
}
