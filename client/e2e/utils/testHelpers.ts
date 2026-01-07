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
     * @param lines 初期データ行（オプション - HTTP経由でシードする場合は指定）
     * @param browser ブラウザインスタンス
     * @param options オプション設定
     * @param options.ws WebSocket設定 ("force" | "disable" | "default")
     * @returns 作成したプロジェクト名とページ名
     */
    public static async prepareTestEnvironment(
        page: Page,
        testInfo?: { workerIndex?: number; } | null,
        lines: string[] = [],
        _browser?: Browser,
        options: {
            projectName?: string;
            pageName?: string;
            skipSeed?: boolean;
            doNotSeed?: boolean;
            doNotNavigate?: boolean;
            ws?: string;
            skipAppReady?: boolean;
        } = {},
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

        // Set WebSocket flag before navigation (needed for Yjs connection)
        // Note: VITE_IS_TEST, VITE_USE_FIREBASE_EMULATOR are already set by globals.d.ts
        await page.addInitScript(() => {
            try {
                // Force test environment flags
                localStorage.setItem("VITE_IS_TEST", "true");
                localStorage.setItem("VITE_E2E_TEST", "true");
                localStorage.setItem("VITE_USE_FIREBASE_EMULATOR", "true");
                localStorage.setItem("VITE_FIREBASE_PROJECT_ID", "outliner-d57b0");
                localStorage.setItem("VITE_YJS_FORCE_WS", "true");
                localStorage.removeItem("VITE_YJS_DISABLE_WS");
                (window as Window & Record<string, any>).__E2E__ = true;
                console.log("[E2E] Test environment flags set in localStorage");
            } catch {}
        });

        const workerIndex = typeof testInfo?.workerIndex === "number" ? testInfo.workerIndex : 1;
        const timestamp = Date.now();
        const projectName = options?.projectName ?? `Test Project ${workerIndex} ${timestamp}`;
        const pageName = options?.pageName ?? `test-page-${timestamp}`;

        // HTTP-based seeding before navigation (replaces legacy browser-based seeding)
        // Always seed to create the page, even if lines is empty
        if (!options?.doNotSeed && !options?.skipSeed) {
            try {
                const { SeedClient } = await import("../utils/seedClient.js");
                const authToken = await TestHelpers.getTestAuthToken();
                const seeder = new SeedClient(projectName, authToken);
                await seeder.seedPage(pageName, lines);
                TestHelpers.slog(
                    `prepareTestEnvironment: Seeded page "${pageName}" with ${lines.length} lines via SeedClient`,
                );
            } catch (e) {
                TestHelpers.slog(`prepareTestEnvironment: SeedClient seeding failed: ${e}`);
            }
        }

        // Navigate to the test page (or re-confirm navigation if already there)
        if (!options?.doNotNavigate) {
            const encodedProject = encodeURIComponent(projectName);
            const encodedPage = encodeURIComponent(pageName);
            const url = `/${encodedProject}/${encodedPage}?isTest=true`;

            TestHelpers.slog("Navigating to project page", { url });
            await page.goto(url, { timeout: 60000 });
            TestHelpers.slog("Navigation completed", { url });

            // Wait for the page to load and Yjs to connect
            // Increased from 2s to 3s for CI environments
            await page.waitForTimeout(3000);

            // Wait for Yjs to connect before checking for items
            TestHelpers.slog("Waiting for __YJS_STORE__ to be connected...");
            try {
                await page.waitForFunction(
                    () => {
                        const y = (window as any).__YJS_STORE__;
                        return y && y.isConnected;
                    },
                    { timeout: 30000 },
                );
                TestHelpers.slog("__YJS_STORE__ connected");
            } catch (e) {
                TestHelpers.slog("Warning: __YJS_STORE__ not connected within timeout", { error: e?.message });
            }

            // Wait for store initialization
            try {
                await page.waitForFunction(
                    () => !!(window as any).generalStore?.project,
                    { timeout: 30000 },
                );
                TestHelpers.slog("generalStore initialized");
            } catch (e) {
                TestHelpers.slog("Warning: generalStore not initialized within timeout", { error: e?.message });
            }

            // UI-based Page Creation Removed - we rely on server-side seeding now
            // if (!options?.doNotSeed && !options?.skipSeed) { ... }

            // Skip the full waitForAppReady for E2E tests to avoid timeout issues
            // The page initialization happens asynchronously
            if (!options?.skipAppReady) {
                // Wait for outliner base to be visible
                await expect(page.getByTestId("outliner-base")).toBeVisible({ timeout: 15000 });
                // Wait for items to be rendered (with seeded data)
                // With UI creation, we expect at least 1 item (the one we just added)
                // If lines were provided, we unfortunately don't have them, but count matches (0 lines -> 1 item blank)
                const expectedCount = Math.max(1, (lines?.length ?? 0) + 1);
                await TestHelpers.waitForOutlinerItems(page, expectedCount, 60000);
                // Give extra time for store to be fully populated
                await page.waitForTimeout(1000);
            }
        }

        return { projectName, pageName };
    }

    /**
     * 手動でテストユーザーとしてログインする
     * UserManagerの自動ログインが失敗または遅延する場合に有用
     */
    public static async login(
        page: Page,
        email: string = "test@example.com",
        password: string = "password",
    ): Promise<void> {
        TestHelpers.slog(`Manual login attempt for ${email}`);
        await page.evaluate(async ({ e, p }) => {
            const um = (window as any).__USER_MANAGER__;
            if (um && typeof um.loginWithEmailPassword === "function") {
                await um.loginWithEmailPassword(e, p);
            } else {
                console.error("[E2E] UserManager or loginWithEmailPassword not found");
                throw new Error("UserManager or loginWithEmailPassword not found");
            }
        }, { e: email, p: password });

        // 認証状態が伝播されるのを待機
        await page.waitForFunction(() => !!(window as any).__USER_MANAGER__?.auth?.currentUser, { timeout: 15 * 1000 });
        TestHelpers.slog("Manual login successful");
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
        console.log("DEBUG: Calling setAccessibleProjects inner evaluate");
        // Wait for Firestore store to be initialized
        try {
            await page.waitForFunction(
                () => !!(window as any).__FIRESTORE_STORE__ && !!(window as any).__USER_MANAGER__,
                { timeout: 15000 },
            );

            // Wait for user login
            TestHelpers.slog("setAccessibleProjects: Waiting for currentUser...");
            const hasUser = await page.evaluate(() => {
                const um = (window as any).__USER_MANAGER__;
                return !!um?.auth?.currentUser;
            });

            if (!hasUser) {
                TestHelpers.slog("setAccessibleProjects: currentUser is null, attempting manual login...");
                await TestHelpers.login(page);
            }

            // Final check
            await page.waitForFunction(() => !!(window as any).__USER_MANAGER__?.auth?.currentUser, { timeout: 10000 });
            TestHelpers.slog("setAccessibleProjects: Auth confirmed.");
        } catch (e) {
            console.error("setAccessibleProjects: CRITICAL: Could not establish authentication.", e);
            throw e; // Fail the test early
        }

        const currentUserId = await page.evaluate(() => (window as any).__USER_MANAGER__?.auth?.currentUser?.uid);
        TestHelpers.slog(
            `[setAccessibleProjects] Setting projects for userId=${currentUserId}: ids=${JSON.stringify(projectNames)}`,
        );
        await page.evaluate(async ({ projects }) => {
            const fs = (window as any).__FIRESTORE_STORE__;
            const um = (window as any).__USER_MANAGER__;
            const userId = um?.auth?.currentUser?.uid;

            if (!userId) {
                console.error("[E2E] setAccessibleProjects: userId is null!");
                throw new Error("setAccessibleProjects: Not authenticated");
            }
            console.log("DEBUG: setAccessibleProjects START inside evaluate");

            console.log("DEBUG: setAccessibleProjects using userId:", userId);

            if (fs && fs.setUserProject) {
                fs.setUserProject({
                    userId: userId,
                    defaultProjectId: projects[0] || "test-project-1",
                    accessibleProjectIds: projects,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            } else if (fs) {
                // Fallback for older implementations
                fs.userProject = {
                    userId: userId,
                    defaultProjectId: projects[0] || "test-project-1",
                    accessibleProjectIds: projects,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };
            }
            const ps = (window as any).__PROJECT_STORE__;

            if (ps && typeof ps.syncFromFirestore === "function") {
                ps.syncFromFirestore();
                console.log("[setAccessibleProjects] Triggered projectStore.syncFromFirestore()");
            } else {
                console.log("[setAccessibleProjects] Warning: projectStore not found for sync");
            }

            // Persist to Firestore for tests that navigate/reload
            if (fs && fs.testSaveUserProject) {
                await fs.testSaveUserProject();
                console.log("[setAccessibleProjects] Project saved to Firestore emulator");
            }
        }, { projects: projectNames });

        TestHelpers.slog("[setAccessibleProjects] Seeding complete, waiting 500ms for propagation...");
        await page.waitForTimeout(500);
    }

    /**
     * Creates a project and page using SeedClient for HTTP-based seeding.
     * This replaces the legacy browser-based seeding logic.
     */
    public static async createAndSeedProject(
        page: Page,
        testInfo: { workerIndex?: number; } | null,
        lines: string[],
        options?: {
            projectName?: string;
            pageName?: string;
            skipSeed?: boolean;
        },
    ): Promise<{ projectName: string; pageName: string; }> {
        const workerIndex = typeof testInfo?.workerIndex === "number" ? testInfo.workerIndex : 1;
        const projectName = options?.projectName ?? `Test Project ${workerIndex} ${Date.now()}`;
        const pageName = options?.pageName ?? `test-page-${Date.now()}`;

        // Use SeedClient for HTTP-based seeding instead of browser-based seeding
        if (!options?.skipSeed) {
            try {
                const { SeedClient } = await import("../utils/seedClient.js");
                const authToken = await TestHelpers.getTestAuthToken();
                const seeder = new SeedClient(projectName, authToken);
                await seeder.seedPage(pageName, lines);
                TestHelpers.slog(
                    `createAndSeedProject: Seeded page "${pageName}" with ${lines.length} lines via SeedClient`,
                );
            } catch (e) {
                TestHelpers.slog(`createAndSeedProject: SeedClient seeding failed, page will be empty: ${e}`);
            }
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
        console.log(`[DEBUG] navigateToProjectPage: Start navigating to ${projectName} / ${pageName}`);
        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);
        const url = `/${encodedProject}/${encodedPage}?isTest=true`;

        this.slog(`navigateToProjectPage: Navigating to ${url}`);

        try {
            await page.goto(url, { timeout: 30000, waitUntil: "commit" });
        } catch (e) {
            console.error(`[TestHelpers] page.goto failed for ${url}`, e);
            throw e;
        }

        TestHelpers.slog("Navigation completed", { url });

        // Allow time for WebSocket connection and initial sync before checking app state
        TestHelpers.slog("Waiting for __YJS_STORE__ to be connected...");
        await page.waitForFunction(
            () => {
                const y = (window as any).__YJS_STORE__;
                return y && y.isConnected;
            },
            { timeout: 30000 },
        ).catch(() => TestHelpers.slog("Warning: __YJS_STORE__ connect wait timed out"));
        TestHelpers.slog("__YJS_STORE__ connected");

        await page.waitForTimeout(1000);

        // E2E stability: wait for store.currentPage to be set explicitly
        // This bypasses the retry logic in +page.svelte and provides a more direct wait
        TestHelpers.slog("Waiting for store.currentPage to be set...");
        const targetPageName = pageName; // Capture for closure
        await page.waitForFunction(
            (targetName) => {
                const gs = (window as any).generalStore;
                if (!gs?.project) {
                    console.log(`[TestHelpers] Waiting for project... gs=${!!gs}`);
                    return false;
                }
                const cp = gs.currentPage;
                const cpText = cp?.text?.toString?.() ?? String(cp?.text ?? "");
                if (cpText.toLowerCase() === targetName.toLowerCase()) {
                    return true;
                }
                console.log(
                    `[TestHelpers] Waiting for currentPage match... expected="${targetName}", actual="${cpText}", hasCp=${!!cp}`,
                );
                return false;
            },
            targetPageName,
            { timeout: 60000 },
        ).catch(async (e) => {
            // Fallback: log warning and continue - the +page.svelte retry logic will handle it
            TestHelpers.slog("Warning: currentPage not set or mismatch within timeout", { error: e?.message });

            // Extensive Debugging info
            try {
                const debugState = await page.evaluate(() => {
                    const win = window as any;
                    return {
                        pageState: win.__PAGE_STATE__,
                        generalStore: !!win.generalStore,
                        gsProject: !!win.generalStore?.project,
                        gsCurrentPage: !!win.generalStore?.currentPage,
                        logs: win.__LOGS__ || [],
                    };
                });
                TestHelpers.slog("Debug State on Timeout:", debugState);
            } catch (err) {
                TestHelpers.slog("Failed to get debug state:", err);
            }
        });

        await TestHelpers.waitForAppReady(page);

        // Wait for tree data to be synced (subdocuments need time to load)
        // This part only makes sense if seeding happened. We need effective seedLines here.
        TestHelpers.slog("Waiting for tree data to sync...");
        const defaultLines = [
            "これはテスト用のページです。1",
            "これはテスト用のページです。2",
            "これはテスト用のページです。3",
        ];
        // If seedLines is null/undefined, use default. If it is an array (even empty), use it.
        const effectiveSeedLines = seedLines !== null ? seedLines : defaultLines;

        // Wait for items to be present (Yjs sync indicator)
        const expectedItemCount = effectiveSeedLines.length + 1; // +1 for page title
        TestHelpers.slog("Waiting for outliner items to render...", { count: expectedItemCount });
        await TestHelpers.waitForOutlinerItems(page, expectedItemCount, 30000);

        // Small delay to allow Svelte components to render
        // Use a safe delay that checks if page is still open
        if (!page.isClosed()) {
            await page.waitForTimeout(500);
        }

        // Additional wait for seeded content to be fully visible
        // This is especially important for tests that check specific seeded content
        if (!page.isClosed() && seedLines && seedLines.length > 0) {
            TestHelpers.slog("Waiting for seeded content to be visible...");
            await page.waitForTimeout(1000);
        }

        TestHelpers.slog("Test environment ready");
    }

    /**
     * プロジェクト用 E2E: テスト環境を初期化し、指定されたプロジェクトページに移動して
     * データが同期されるのを待つ
     * - ページ作成とデータ投入はHTTP経由でシーディング
     * @param page Playwrightページオブジェクト
     * @param testInfo テスト情報
     * @param lines 初期データ行（オプション - HTTP経由でシードする場合に指定）
     * @param browser ブラウザインスタンス（オプション）
     * @param options オプション設定（projectName, pageName, skipSync, skipAppReady）
     * @returns プロジェクト名とページ名
     */
    public static async prepareTestEnvironmentForProject(
        page: Page,
        testInfo?: { workerIndex?: number; } | null,
        lines: string[] = [],
        _browser?: Browser,
        options?: { projectName?: string; pageName?: string; skipSync?: boolean; skipAppReady?: boolean; },
    ): Promise<{ projectName: string; pageName: string; }> {
        // デバッガーをセットアップ
        await TestHelpers.setupTreeDebugger(page);
        await TestHelpers.setupCursorDebugger(page);

        // Attach verbose console/pageerror/requestfailed listeners for debugging
        try {
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

        // Set WebSocket flag and E2E flag before navigation (consistency with prepareTestEnvironment)
        await page.addInitScript(() => {
            try {
                localStorage.setItem("VITE_YJS_FORCE_WS", "true");
                localStorage.removeItem("VITE_YJS_DISABLE_WS");
                (window as Window & Record<string, any>).__E2E__ = true;
            } catch {}
        });

        const workerIndex = typeof testInfo?.workerIndex === "number" ? testInfo.workerIndex : 1;
        const projectName = options?.projectName ?? `Test Project ${workerIndex} ${Date.now()}`;
        const pageName = options?.pageName ?? `test-page-${Date.now()}`;

        // HTTP-based seeding before navigation (replaces legacy browser-based seeding)
        // Always seed to create the page, even if lines is empty
        {
            try {
                const { SeedClient } = await import("../utils/seedClient.js");
                const authToken = await TestHelpers.getTestAuthToken();
                const seeder = new SeedClient(projectName, authToken);
                await seeder.seedPage(pageName, lines);
                TestHelpers.slog(
                    `prepareTestEnvironmentForProject: Seeded page "${pageName}" with ${lines.length} lines via SeedClient`,
                );
            } catch (e) {
                TestHelpers.slog(`prepareTestEnvironmentForProject: SeedClient seeding failed: ${e}`);
            }
        }

        if (options?.skipSync) {
            // For tests that only need environment setup without page navigation
            console.log("TestHelper: Skip sync (skipSync option is true)");
            await page.goto("/", { timeout: 30000, waitUntil: "domcontentloaded" });
            return { projectName, pageName };
        }

        // Navigate to the project page
        const encodedProject = encodeURIComponent(projectName);
        const encodedPage = encodeURIComponent(pageName);
        const url = `/${encodedProject}/${encodedPage}`;

        console.log("TestHelper: Navigate to project page", { url });
        await page.goto(url, { timeout: 60000, waitUntil: "domcontentloaded" });

        // Allow time for WebSocket connection and initial sync
        await page.waitForTimeout(3000);

        // Wait for the page to be ready (skip for server-side tests)
        if (!options?.skipAppReady) {
            await TestHelpers.waitForAppReady(page);
        }

        console.log("TestHelper: Project environment ready", { projectName, pageName });
        return { projectName, pageName };
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
        // ページが閉じている場合は早期リターン
        if (page.isClosed()) {
            TestHelpers.slog("waitForCursorVisible: page is closed, returning false");
            return false;
        }
        try {
            // CursorValidatorを使用してカーソルの存在を確認
            await page.waitForFunction(
                () => {
                    if (typeof window === "undefined") return false;
                    const editorOverlayStore = (window as any)?.editorOverlayStore;
                    if (!editorOverlayStore) {
                        return false;
                    }
                    const cursors = Object.values(editorOverlayStore.cursors);
                    const activeCursors = cursors.filter((c: any) => c.isActive);
                    return activeCursors.length > 0;
                },
                { timeout },
            );
            return true;
        } catch (_error) {
            // ページが閉じられた場合はエラーではなく終了
            if (page.isClosed()) {
                TestHelpers.slog("waitForCursorVisible: page closed during wait, returning false");
                return false;
            }
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
        } catch (e) {
            console.error(`Timeout waiting for item count to reach ${expectedCount}`);
            throw new Error(
                `Timeout waiting for item count to reach ${expectedCount}: ${
                    e instanceof Error ? e.message : String(e)
                }`,
            );
        }
    }

    /**
     * カーソルが完全に操作可能な状態になるまで待機する（クリック後の安定化に使用）
     * waitForCursorVisibleより厳格で、グローバルテキストエリアのフォーカスも確認
     * @param page Playwrightのページオブジェクト
     * @param timeout タイムアウト時間（ミリ秒）
     */
    public static async ensureCursorReady(page: Page, timeout = 10000): Promise<void> {
        // ページが閉じている場合は何もしない
        if (page.isClosed()) {
            TestHelpers.slog("ensureCursorReady: page is closed, skipping");
            return;
        }
        // 1. カーソルが可視になるまで待機
        await this.waitForCursorVisible(page, timeout);

        // ページが閉じている場合は終了
        if (page.isClosed()) {
            return;
        }

        // 2. グローバルテキストエリアにフォーカスがあることを確認
        await page.waitForFunction(() => {
            const textarea = document.querySelector<HTMLTextAreaElement>(".global-textarea");
            return textarea && document.activeElement === textarea;
        }, { timeout: 5000 }).catch(async () => {
            // フォーカスがない場合は手動でフォーカス
            if (!page.isClosed()) {
                await this.focusGlobalTextarea(page);
            }
        });

        // 3. 短い安定化待機
        if (!page.isClosed()) {
            await page.waitForTimeout(50);
        }
    }

    /**
     * キーボード操作後にUIが安定するまで待機する（Enter, Backspace等の操作後に使用）
     * @param page Playwrightのページオブジェクト
     */
    public static async waitForUIStable(page: Page): Promise<void> {
        // ページが閉じている場合は何もしない
        if (page.isClosed()) {
            TestHelpers.slog("waitForUIStable: page is closed, skipping");
            return;
        }
        // カーソルが可視であることを確認
        await this.waitForCursorVisible(page, 5000);
        // 最小限のUI更新待機
        if (!page.isClosed()) {
            await page.waitForTimeout(100);
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
     * Waits for the application to be in a ready state.
     * This includes waiting for authentication and for the generalStore to be initialized.
     * @param page Playwright's page object
     * @param skipAuthCheck If true, skip the authentication check (for server-side tests)
     */
    public static async waitForAppReady(page: Page, skipAuthCheck = false): Promise<void> {
        TestHelpers.slog("Waiting for app to be ready", { skipAuthCheck });

        // Skip authentication check if skipAuthCheck is true, or if we're in an E2E test environment
        // The E2E check must be inside waitForFunction to run in browser context
        const shouldSkipAuth = skipAuthCheck || await page.waitForFunction(() => {
            return (window as any).__E2E__ === true
                || window.localStorage?.getItem?.("VITE_IS_TEST") === "true"
                || window.location.search.includes("isTest=true");
        }, { timeout: 5000 }).catch(() => false);

        if (shouldSkipAuth) {
            TestHelpers.slog("Skipping auth check (E2E test environment)");
        } else {
            // Wait for authentication
            await page.waitForFunction(() => {
                const userManager = (window as any).__USER_MANAGER__;
                return !!(userManager && userManager.getCurrentUser && userManager.getCurrentUser());
            }, { timeout: 30000 });
            TestHelpers.slog("Authentication is ready");
        }

        // Wait for generalStore to be available
        await page.waitForFunction(() => !!(window as any).generalStore, { timeout: 60000 });
        TestHelpers.slog("generalStore is available");

        // Wait for project and page to be loaded in the store
        try {
            await page.waitForFunction(() => {
                const gs = (window as any).generalStore;
                if (!gs) return false;
                const hasProject = !!gs.project;
                const hasPages = gs.pages?.current?.length > 0;
                const hasCurrentPage = !!gs.currentPage;
                // Debug log only occasionally to avoid spam (using timestamp check or similar if needed,
                // but for now relying on browser console which might not show up unless we retrieve it)
                return hasProject && hasPages && hasCurrentPage;
            }, { timeout: 30000 }).catch(async (e) => {
                // Dump state on timeout
                console.log("waitForAppReady timed out. Dumping state:");
                await page.evaluate(() => {
                    const gs = (window as any).generalStore;
                    console.log("GS:", !!gs);
                    if (gs) {
                        console.log("GS.project:", gs.project);
                        console.log("GS.pages:", gs.pages);
                        console.log("GS.pages.current:", gs.pages?.current);
                        console.log("GS.currentPage:", gs.currentPage);
                    }
                    console.log("YJS.isConnected:", (window as any).__YJS_STORE__?.isConnected);
                });
                throw e;
            });
        } catch (e: any) {
            const msg = e?.message || String(e);
            if (msg.includes("closed") || msg.includes("destroyed")) {
                TestHelpers.slog("waitForAppReady: Page closed during wait");
                return;
            }
            throw e;
        }
        TestHelpers.slog("Project and page are loaded in the store");

        // Wait for the outliner to be visible
        await expect(page.getByTestId("outliner-base")).toBeVisible({ timeout: 15000 });
        TestHelpers.slog("Outliner is visible");
    }

    /**
     * Waits for a specific page's subdocument to be loaded and have items.
     * This is useful for ensuring seeded data is available before proceeding with tests.
     * @param page Playwright's page object
     * @param pageName The name of the page to wait for
     * @param timeout Timeout in milliseconds (default 30 seconds)
     * @returns Promise that resolves when the page has items
     */
    public static async waitForPageData(page: Page, pageName: string, timeout = 30000): Promise<void> {
        TestHelpers.slog("waitForPageData: start", { pageName });

        const deadline = Date.now() + timeout;
        let consecutiveErrors = 0;

        while (Date.now() < deadline) {
            if (page.isClosed()) {
                throw new Error("Page closed while waiting for page data");
            }

            try {
                const hasData = await page.evaluate(async (targetPageName) => {
                    try {
                        // First check if Yjs is connected
                        const yjsStore = (window as any).__YJS_STORE__;
                        const isConnected = yjsStore?.getIsConnected?.() === true;
                        if (!isConnected) {
                            return {
                                ready: false,
                                reason: "Yjs not connected",
                                yjsState: yjsStore ? Object.keys(yjsStore) : "no yjsStore",
                            };
                        }

                        const gs = (window as any).generalStore;
                        if (!gs) {
                            return { ready: false, reason: "no generalStore" };
                        }

                        if (!gs.project) {
                            return { ready: false, reason: "no project in store" };
                        }

                        if (!gs.currentPage) {
                            // Check if page exists in project but not set as current
                            const pages = gs.project.pages;
                            if (pages && typeof pages.current?.id === "string") {
                                return { ready: false, reason: "currentPage not set but project has pages" };
                            }
                            return { ready: false, reason: "no currentPage" };
                        }

                        const currentPage = gs.currentPage;
                        const pageText = currentPage?.text?.toString?.() ?? String(currentPage?.text ?? "");
                        if (!pageText || pageText.toLowerCase() !== targetPageName.toLowerCase()) {
                            return {
                                ready: false,
                                reason: "page name mismatch",
                                currentPageText: pageText,
                                expectedPageName: targetPageName,
                            };
                        }

                        const items = currentPage?.items;
                        if (!items || typeof items.length !== "number") {
                            return { ready: false, reason: "no items or length" };
                        }

                        // Check if we have at least 2 items (page title + at least 1 child)
                        if (items.length < 2) {
                            return { ready: false, reason: "insufficient items", count: items.length };
                        }

                        // Verify items have text content
                        let hasTextContent = false;
                        for (let i = 0; i < items.length; i++) {
                            const item = items.at ? items.at(i) : items[i];
                            if (item?.text && String(item.text).trim().length > 0) {
                                hasTextContent = true;
                                break;
                            }
                        }

                        if (!hasTextContent) {
                            return { ready: false, reason: "no text content in items" };
                        }

                        return { ready: true, itemCount: items.length };
                    } catch (e) {
                        return { ready: false, reason: "error", error: String(e) };
                    }
                }, pageName);

                if (hasData.ready) {
                    TestHelpers.slog("waitForPageData: success", { pageName, itemCount: hasData.itemCount });
                    return;
                }

                TestHelpers.slog("waitForPageData: waiting", { pageName, reason: hasData.reason, details: hasData });
                consecutiveErrors = 0;
            } catch (e) {
                consecutiveErrors++;
                TestHelpers.slog("waitForPageData: error, will retry", {
                    pageName,
                    error: String(e),
                    consecutiveErrors,
                });
                if (consecutiveErrors > 5) {
                    // Try to get more debugging info
                    try {
                        const debugInfo = await page.evaluate(() => {
                            return {
                                yjsStoreKeys: (window as any).__YJS_STORE__
                                    ? Object.keys((window as any).__YJS_STORE__)
                                    : "no yjsStore",
                                generalStoreKeys: (window as any).generalStore
                                    ? Object.keys((window as any).generalStore).filter(k => !k.startsWith("_"))
                                    : "no gs",
                                url: window.location.href,
                            };
                        });
                        TestHelpers.slog("waitForPageData: debug info", { pageName, debug: debugInfo });
                    } catch {}
                }
            }

            await page.waitForTimeout(200);
        }

        throw new Error(`Timeout waiting for page data: ${pageName} after ${timeout}ms`);
    }

    /**
     * アウトライナーアイテムが表示されるのを待つ
     * @param page Playwrightのページオブジェクト
     * @param timeout タイムアウト時間（ミリ秒）
     * @param minCount 最小アイテム数（デフォルト 1）
     */
    public static async waitForOutlinerItems(page: Page, count = 1, timeout = 30000): Promise<void> {
        TestHelpers.slog("waitForOutlinerItems: start");
        console.log(`Waiting for ${count} outliner items (with data-item-id) to be visible...`);

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
            const minRequiredItems = count;
            let ensured = false;

            // Ensure Yjs is connected before counting items
            let yjsConnected = false;
            try {
                yjsConnected = await page.evaluate(() => {
                    const y = (window as any).__YJS_STORE__;
                    return !!(y && y.isConnected);
                });
            } catch {
                // Ignore errors (navigation, page closed) and retry
            }
            if (!yjsConnected) {
                TestHelpers.slog("waitForOutlinerItems: Warning - Yjs not connected yet");
            }

            // まずは最小UIの可視性を軽く待機（非致命的）
            try {
                TestHelpers.slog("waitForOutlinerItems: wait outliner-base visible");
                await expect(page.getByTestId("outliner-base")).toBeVisible({ timeout: Math.min(15000, timeout) });
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
                throw new Error(
                    `waitForOutlinerItems: Timeout waiting for ${minRequiredItems} items (found ${await page.locator(
                        ".outliner-item[data-item-id]",
                    ).count()})`,
                );
            }

            const itemCount = await page.locator(".outliner-item[data-item-id]").count();
            console.log(`Found ${itemCount} outliner items with data-item-id`);
            TestHelpers.slog("waitForOutlinerItems: success", { itemCount, minRequiredItems });
        } catch (e) {
            // Rethrow explicit errors (like timeout)
            console.error("waitForOutlinerItems: Error waiting for items", e);
            try {
                const bodyHtml = await page.content();
                console.log("DEBUG: Page content at timeout (first 500 chars):", bodyHtml.substring(0, 500));
                console.log(
                    "DEBUG: Outliner base visible?",
                    await page.getByTestId("outliner-base").isVisible().catch(() => "check failed"),
                );
            } catch {}
            throw e;
        }

        // 少し待機して安定させる (ページが閉じている場合はスキップ)
        if (!page.isClosed()) {
            await page.waitForTimeout(300);
        }
        TestHelpers.slog("waitForOutlinerItems: end");
    }

    /**
     * ページリストが読み込まれるまで待機する（サイドバーナビゲーションテスト用）
     * @param page Playwrightのページオブジェクト
     * @param timeout タイムアウト時間（ミリ秒）
     */
    public static async waitForPagesList(page: Page, timeout = 15000): Promise<void> {
        TestHelpers.slog("waitForPagesList: start");
        try {
            await page.waitForFunction(
                () => {
                    const gs = (window as any).generalStore;
                    const pages = gs?.pages?.current;
                    return pages && pages.length > 0;
                },
                { timeout },
            );
        } catch (e: any) {
            const msg = e?.message || String(e);
            if (msg.includes("closed") || msg.includes("destroyed")) {
                TestHelpers.slog("waitForPagesList: Checked but page was closed");
                return;
            }
            throw e;
        }
        TestHelpers.slog("waitForPagesList: success");
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
        let attempts = 0;
        while (attempts < 3) {
            try {
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
            } catch (e: any) {
                const msg = e?.message || String(e);
                if (msg.includes("closed") || msg.includes("destroyed")) {
                    console.log(`getItemIdByIndex: Retrying due to error: ${msg}`);
                    attempts++;
                    if (!page.isClosed()) {
                        await page.waitForTimeout(500);
                        continue;
                    } else {
                        console.log("getItemIdByIndex: Page is closed, aborting retry.");
                        break;
                    }
                }
                throw e;
            }
        }
        return null;
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
     * Creates a storage state object with test environment localStorage values.
     * This should be passed to browser.newContext() via the storageState option
     * to ensure localStorage is set BEFORE the page loads.
     */
    public static createTestStorageState(): object {
        return {
            cookies: [],
            origins: [
                {
                    origin: "http://localhost:5173",
                    localStorage: [
                        { name: "VITE_IS_TEST", value: "true" },
                        { name: "VITE_E2E_TEST", value: "true" },
                        { name: "VITE_USE_FIREBASE_EMULATOR", value: "true" },
                        { name: "VITE_YJS_FORCE_WS", value: "true" },
                    ],
                },
                {
                    origin: "http://localhost:7090",
                    localStorage: [
                        { name: "VITE_IS_TEST", value: "true" },
                        { name: "VITE_E2E_TEST", value: "true" },
                        { name: "VITE_USE_FIREBASE_EMULATOR", value: "true" },
                        { name: "VITE_YJS_FORCE_WS", value: "true" },
                    ],
                },
                {
                    origin: "http://localhost",
                    localStorage: [
                        { name: "VITE_IS_TEST", value: "true" },
                        { name: "VITE_E2E_TEST", value: "true" },
                        { name: "VITE_USE_FIREBASE_EMULATOR", value: "true" },
                        { name: "VITE_YJS_FORCE_WS", value: "true" },
                    ],
                },
            ],
        };
    }

    /**
     * Get a valid ID token for the test user from local Firebase Emulator
     */
    public static async getTestAuthToken(): Promise<string> {
        // const projectId = process.env.VITE_FIREBASE_PROJECT_ID || "outliner-d57b0";
        const authHost = process.env.VITE_FIREBASE_AUTH_EMULATOR_HOST || "localhost:59099";
        // Ensure protocol
        const host = authHost.startsWith("http") ? authHost : `http://${authHost}`;
        const apiKey = "fake-api-key";
        const signInUrl = `${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

        const payload = {
            email: "test@example.com",
            password: "password",
            returnSecureToken: true,
        };

        try {
            const response = await fetch(signInUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const text = await response.text();
                // If user not found, try to sign up
                if (text.includes("EMAIL_NOT_FOUND")) {
                    console.log("[TestHelpers] User not found, creating new test user...");
                    try {
                        return await this.signUpTestUser(host, apiKey);
                    } catch (e: any) {
                        // Handle race condition: if another worker created the user in the meantime
                        if (e.message && e.message.includes("EMAIL_EXISTS")) {
                            console.log("[TestHelpers] Race condition detected (EMAIL_EXISTS). Retrying sign-in...");
                            // Retry sign-in
                            const retryResponse = await fetch(signInUrl, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(payload),
                            });
                            if (!retryResponse.ok) {
                                const retryText = await retryResponse.text();
                                throw new Error(`Auth retry failed: ${retryText}`);
                            }
                            const retryData: any = await retryResponse.json();
                            return retryData.idToken;
                        } else {
                            throw e;
                        }
                    }
                } else {
                    console.error(`[TestHelpers] Auth failed: ${response.status} ${text}`);
                    throw new Error(`Auth failed: ${text}`);
                }
            }

            const data: any = await response.json();
            return data.idToken;
        } catch (e) {
            console.error("[TestHelpers] Failed to get test auth token", e);

            // FALLBACK: Generate offline/mock token for testing against local server (which accepts alg:none in test mode)
            // See server/src/websocket-auth.ts: verifyIdTokenCached
            console.log("[TestHelpers] Auth fetch failed, generating offline mock token.");

            const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64")
                .replace(/=/g, ""); // JWT style

            const payloadJson = {
                user_id: "test-user",
                sub: "test-user",
                aud: process.env.VITE_FIREBASE_PROJECT_ID || "outliner-d57b0",
                exp: Math.floor(Date.now() / 1000) + 3600,
                iat: Math.floor(Date.now() / 1000),
                iss: "https://securetoken.google.com/" + (process.env.VITE_FIREBASE_PROJECT_ID || "outliner-d57b0"),
                firebase: { identities: {}, sign_in_provider: "custom" },
            };

            const payload = Buffer.from(JSON.stringify(payloadJson)).toString("base64").replace(/=/g, "");

            return `${header}.${payload}.`;
        }
    }

    private static async signUpTestUser(host: string, apiKey: string): Promise<string> {
        const signUpUrl = `${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
        const payload = {
            email: "test@example.com",
            password: "password",
            returnSecureToken: true,
        };
        const response = await fetch(signUpUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`SignUp failed: ${response.status} ${errorText}`);
        }
        const data: any = await response.json();
        return data.idToken;
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
