/** @feature COL-b7a9c2d1
 * Title   : Show collaborator cursor positions
 * Source  : docs/client-features/col-show-collaborator-cursor-positions-b7a9c2d1.yaml
 */
import { expect, test } from "@playwright/test";
import "../utils/registerAfterEachSnapshot";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

test.describe("COL-b7a9c2d1: collaborator cursor presence", () => {
    test("renders remote cursor and selection updates", async ({ browser }, testInfo) => {
        // page1を作成してプロジェクト/ページを準備
        const context1 = await browser.newContext();
        const page1 = await context1.newPage();
        // WebSocketを有効にする
        await page1.addInitScript(() => {
            localStorage.setItem("VITE_YJS_ENABLE_WS", "true");
        });
        const { projectName, pageName } = await TestHelpers.prepareTestEnvironment(page1, testInfo, ["Collaborators"]);

        // page1でアイテムが表示されるまで待機
        await TestHelpers.waitForElementVisible(page1, ".outliner-item", 20000);

        // page1でYjsクライアントが初期化されるまで待機
        await page1.waitForFunction(() => {
            const yjsStore = (window as any).__YJS_STORE__;
            const client = yjsStore?.yjsClient;
            if (!client) return false;
            const project = client.getProject?.();
            return !!(project && project.items);
        }, { timeout: 15000 });

        // page1のページIDとプロジェクトIDを取得
        const page1Info = await page1.evaluate(() => {
            const currentPage = (window as any).appStore?.currentPage;
            const yjsStore = (window as any).__YJS_STORE__;
            const client = yjsStore?.yjsClient;
            const project = client?.getProject?.();
            return {
                pageId: currentPage?.id,
                projectId: client?.containerId,
                projectTitle: project?.title,
            };
        });
        console.log("Page1 info:", page1Info);

        // page2用のコンテキストとページを作成
        const context2 = await browser.newContext();
        const page2 = await context2.newPage();

        // page2用の初期化スクリプトを設定
        await page2.addInitScript(() => {
            localStorage.setItem("VITE_YJS_ENABLE_WS", "true");
        });

        // page2でもprepareTestEnvironmentを呼び出して環境を初期化
        await TestHelpers.prepareTestEnvironment(page2, testInfo, ["Collaborators"]);

        // page2を同じページに移動
        const page1Url = await page1.evaluate(() => window.location.href);
        console.log(`page2: Navigating to ${page1Url}`);
        await page2.goto(page1Url, { waitUntil: "domcontentloaded" });

        // page2でプロジェクトが読み込まれるまで待機
        await page2.waitForFunction(() => {
            const yjsStore = (window as any).__YJS_STORE__;
            const client = yjsStore?.yjsClient;
            const project = client?.getProject?.();
            return !!(project && project.items);
        }, { timeout: 15000 });

        // page2でYjs WebSocketプロバイダーが同期されるまで待機（最大30秒）
        console.log("page2: Waiting for Yjs WebSocket provider to sync...");
        const page2Synced = await page2.waitForFunction(() => {
            const yjsStore = (window as any).__YJS_STORE__;
            const client = yjsStore?.yjsClient;
            const provider = client?.wsProvider;
            if (!provider) {
                console.log("page2: wsProvider not found");
                return false;
            }
            const synced = provider.synced;
            const wsConnected = provider.wsconnected;
            console.log(`page2: wsProvider status - synced: ${synced}, wsConnected: ${wsConnected}`);
            return synced === true;
        }, { timeout: 30000 }).catch(() => false);

        if (!page2Synced) {
            console.log("page2: Yjs WebSocket provider sync timeout, continuing anyway...");
        } else {
            console.log("page2: Yjs WebSocket provider synced successfully");
        }

        // page2でpage1のページが同期されるまで待機（最大30秒）
        console.log(`page2: Waiting for page1's page (ID: ${page1Info.pageId}) to appear...`);
        await page2.waitForFunction(
            ({ pageId }) => {
                const yjsStore = (window as any).__YJS_STORE__;
                const client = yjsStore?.yjsClient;
                const project = client?.getProject?.();
                if (!project) {
                    console.log("page2: project not found");
                    return false;
                }

                const items = project.items as any;
                const len = items?.length ?? 0;
                console.log(`page2: Checking for page ${pageId}, current pageCount=${len}`);
                for (let i = 0; i < len; i++) {
                    const page = items.at ? items.at(i) : items[i];
                    if (page && page.id === pageId) {
                        console.log(`page2: Found page with ID ${pageId}`);
                        return true;
                    }
                }
                return false;
            },
            { pageId: page1Info.pageId },
            { timeout: 30000 },
        );

        // page2でpage1のページを設定
        await page2.evaluate(({ pageId }) => {
            const yjsStore = (window as any).__YJS_STORE__;
            const client = yjsStore?.yjsClient;
            const project = client?.getProject?.();
            if (!project) throw new Error("Project not found");

            const items = project.items as any;
            const len = items?.length ?? 0;
            for (let i = 0; i < len; i++) {
                const page = items.at ? items.at(i) : items[i];
                if (page && page.id === pageId) {
                    (window as any).appStore.currentPage = page;
                    console.log(`page2: Set currentPage to page with ID ${pageId}`);
                    return;
                }
            }
            throw new Error(`Page with ID ${pageId} not found`);
        }, { pageId: page1Info.pageId });

        console.log("page2: Successfully switched to page1's page");

        // page2のページIDを確認
        const page2Info = await page2.evaluate(() => {
            const currentPage = (window as any).appStore?.currentPage;
            return {
                pageId: currentPage?.id,
            };
        });
        console.log("Page2 info:", page2Info);

        // page1とpage2が同じページを見ているか確認
        if (page1Info.pageId !== page2Info.pageId) {
            throw new Error(`Page IDs do not match: page1=${page1Info.pageId}, page2=${page2Info.pageId}`);
        }

        // page2でアイテムが表示されるまで待機
        await TestHelpers.waitForElementVisible(page2, ".outliner-item", 20000);

        // page1とpage2でページレベルのYjs awarenessが初期化されるまで待機
        await page1.waitForFunction(
            ({ pageId }) => {
                const yjsStore = (window as any).__YJS_STORE__;
                const client = yjsStore?.yjsClient;
                if (!client) return false;
                const pageAwareness = client.getPageAwareness?.(pageId);
                if (!pageAwareness) return false;
                const localState = pageAwareness.getLocalState();
                return !!(localState && localState.user);
            },
            { pageId: page1Info.pageId },
            { timeout: 10000 },
        );

        await page2.waitForFunction(
            ({ pageId }) => {
                const yjsStore = (window as any).__YJS_STORE__;
                const client = yjsStore?.yjsClient;
                if (!client) return false;
                const pageAwareness = client.getPageAwareness?.(pageId);
                if (!pageAwareness) return false;
                const localState = pageAwareness.getLocalState();
                return !!(localState && localState.user);
            },
            { pageId: page2Info.pageId },
            { timeout: 10000 },
        );

        // 両方のページでawarenessが接続されるまで待機
        await page1.waitForTimeout(2000);
        await page2.waitForTimeout(2000);

        // page1の最初のアイテムを取得
        const firstItem1 = page1.locator(".outliner-item").first();
        const firstItemId = await firstItem1.getAttribute("data-item-id");
        if (!firstItemId) throw new Error("firstItemId not found");

        // page1でカーソルと選択を設定（ページレベルのawarenessを使用）
        await page1.evaluate(({ itemId, pageId }) => {
            const store = (window as any).editorOverlayStore;
            if (!store) throw new Error("editorOverlayStore unavailable");

            // カーソルを設定
            store.setCursor({
                itemId: itemId,
                offset: 4,
                isActive: true,
                userId: "local",
            });

            // 選択を設定
            store.setSelection({
                startItemId: itemId,
                startOffset: 0,
                endItemId: itemId,
                endOffset: 4,
                isReversed: false,
                userId: "local",
            });

            // ページレベルのawarenessにpresence状態を設定
            const yjsStore = (window as any).__YJS_STORE__;
            const client = yjsStore?.yjsClient;
            const pageAwareness = client?.getPageAwareness?.(pageId);
            if (pageAwareness) {
                pageAwareness.setLocalStateField("presence", {
                    cursor: { itemId, offset: 4 },
                    selection: {
                        startItemId: itemId,
                        startOffset: 0,
                        endItemId: itemId,
                        endOffset: 4,
                        isReversed: false,
                    },
                });
                console.log("page1: set page awareness presence");
            } else {
                console.log("page1: page awareness not found");
            }
        }, { itemId: firstItemId, pageId: page1Info.pageId });

        // presence同期のための待機
        await page1.waitForTimeout(3000);

        // page2でリモートカーソルが表示されるまで待機
        await page2.waitForFunction(
            ({ pageId }) => {
                const store = (window as any).editorOverlayStore;
                if (!store) {
                    console.log("page2: editorOverlayStore not found");
                    return false;
                }
                const cursors = Object.values(store.cursors);
                const remoteCursors = cursors.filter((c: any) => c.userId && c.userId !== "local");
                console.log("page2: cursors", { total: cursors.length, remote: remoteCursors.length });

                // ページレベルのawarenessの状態も確認
                const yjsStore = (window as any).__YJS_STORE__;
                const client = yjsStore?.yjsClient;
                if (client) {
                    const pageAwareness = client.getPageAwareness?.(pageId);
                    if (pageAwareness) {
                        const states = (pageAwareness as any).getStates();
                        const clientId = (pageAwareness as any).clientID;
                        console.log("page2: page awareness", { statesCount: states.size, clientId });
                        // 全てのawareness stateをログ出力
                        states.forEach((state: any, id: number) => {
                            console.log(`page2: page awareness state[${id}]`, state);
                        });
                    }
                }

                return remoteCursors.length > 0;
            },
            { pageId: page2Info.pageId },
            { timeout: 15000 },
        );

        // リモートカーソルの色を確認
        const remoteCursorColor = await page2.evaluate(() => {
            const store = (window as any).editorOverlayStore;
            const cursor = Object.values(store.cursors).find((c: any) => c.userId && c.userId !== "local") as any;
            return cursor?.color || null;
        });
        expect(remoteCursorColor).not.toBeNull();

        // page2でリモート選択が表示されるまで待機
        await page2.waitForFunction(() => {
            const store = (window as any).editorOverlayStore;
            if (!store) return false;
            return Object.values(store.selections).some((sel: any) => sel.userId && sel.userId !== "local");
        }, { timeout: 15000 });

        await context1.close();
        await context2.close();
    });
});
