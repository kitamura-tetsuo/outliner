<script lang="ts">
import { goto } from "$app/navigation";
// Use SvelteKit page store from $app/stores (not $app/state)
import { page } from "$app/stores";
import {
    onDestroy,
    onMount
} from "svelte";

import { userManager } from "../../../auth/UserManager";
import AuthComponent from "../../../components/AuthComponent.svelte";
import BacklinkPanel from "../../../components/BacklinkPanel.svelte";
import OutlinerBase from "../../../components/OutlinerBase.svelte";
import SearchPanel from "../../../components/SearchPanel.svelte";
import {
    cleanupLinkPreviews,
    setupLinkPreviewHandlers,
} from "../../../lib/linkPreviewHandler";
import { getLogger } from "../../../lib/logger";
import { createSnapshotClient, loadProjectSnapshot, snapshotToProject } from "../../../lib/projectSnapshot";
import { getYjsClientByProjectTitle, createNewYjsProject } from "../../../services";
const logger = getLogger("+page");

import { yjsStore } from "../../../stores/yjsStore.svelte";
import { searchHistoryStore } from "../../../stores/SearchHistoryStore.svelte";
import { store } from "../../../stores/store.svelte";
import { editorOverlayStore } from "../../../stores/EditorOverlayStore.svelte";

import { SvelteSet } from 'svelte/reactivity';

// Track which pages have been hydrated to prevent duplicate hydration during retries
// This is needed because hydratePageItems can be called multiple times
const _hydratedPages = new SvelteSet<string>();

// URLパラメータを取得（SvelteKit page store に追従）
// NOTE: `$page` の値を参照する必要がある（store オブジェクトではなく値）。
// 以前は `page.params.page` としていたため、`page` が未解決のまま property 参照して TypeError になっていた。
let projectName: string = $derived.by(() => $page.params.project ?? "");
let pageName: string = $derived.by(() => $page.params.page ?? "");

// デバッグ用ログ
// logger at init; avoid referencing derived vars outside reactive contexts to silence warnings

// ページの状態
let error: string | undefined = $state(undefined);
let isLoading = $state(true);
let isAuthenticated = $state(false);
let pageNotFound = $state(false);

let isSearchPanelVisible = $state(false); // 検索パネルの表示状態

// Optional variable for pending imports - defined to avoid ESLint no-undef errors
// This is used in conditional checks and may be set by external code
let pendingImport: any[] | undefined; // eslint-disable-line @typescript-eslint/no-unused-vars
let project: any; // eslint-disable-line @typescript-eslint/no-unused-vars

// URLパラメータと認証状態を監視して更新
// 同一条件での多重実行を避け、Svelte の update depth exceeded を回避するためのキー
// 注意: $state を使うと $effect が自分で読んで書く依存を持ちループになるため、通常変数で保持する
let lastLoadKey: string | null = null;
let __loadingInProgress = false; // 再入防止

function projectLooksLikePlaceholder(candidate: any): boolean {
    if (!candidate) return true;
    try {
        const items: any = candidate.items as any;
        const length = items?.length ?? 0;
        if (length === 0) return true;
        if (length === 1) {
            const first = items.at ? items.at(0) : items[0];
            const text = first?.text?.toString?.() ?? String(first?.text ?? "");
            const childLength = first?.items?.length ?? 0;
            if (text === "settings" && childLength === 0) return true;
        }
    } catch {}
    return false;
}




/**
 * ロード条件を評価し、必要であればロードを開始する
 * $effect を使わず、onMount とイベント購読から明示的に呼び出す
 */
function scheduleLoadIfNeeded(
    opts?: { project?: string; page?: string; authenticated?: boolean },
) {
    // 現在のパラメータを取得
    const pj = (opts?.project ?? projectName) || "";
    const pg = (opts?.page ?? pageName) || "";
    const auth = opts?.authenticated ?? isAuthenticated;

    const isTestEnv = import.meta.env.MODE === "test"
        || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
        || (typeof window !== "undefined" && (window as any).__E2E__ === true);

    // DEBUG: Log to console directly to see if it's captured
    if (typeof console !== 'undefined') {
        console.log("[DEBUG] scheduleLoadIfNeeded called", { pj, pg, auth, isTestEnv, hasStore: !!store });
    }

    // 条件未成立
    if (!pj || !pg || !(auth || isTestEnv)) {
        logger.info(
            `scheduleLoadIfNeeded: skip (project="${pj}" (${!!pj}), page="${pg}" (${!!pg}), auth=${auth}, test=${isTestEnv})`,
        );
        return;
    }

    const key = `${pj}::${pg}::${auth || isTestEnv}`;
    if (__loadingInProgress || lastLoadKey === key) {
        logger.info("scheduleLoadIfNeeded: duplicate or in-progress; skip");
        return;
    }
    lastLoadKey = key;

    // Execute immediately in test environments to avoid race conditions with child component mounting
    // The setTimeout(0) deferral caused timing issues where OutlinerBase mounted before currentPage was set
    const isTestEnvForLoad = import.meta.env.MODE === "test"
        || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
        || (typeof window !== "undefined" && (window as any).__E2E__ === true);
    if (isTestEnvForLoad) {
        if (!__loadingInProgress) loadProjectAndPage();
    } else {
        // 反応深度の問題を避けるため、イベントループに委ねる
        setTimeout(() => {
            if (!__loadingInProgress) loadProjectAndPage();
        }, 0);
    }
}

// 認証成功時の処理
async function handleAuthSuccess(authResult: any) {
    logger.info("handleAuthSuccess: 認証成功:", authResult);
    logger.info(`handleAuthSuccess: Setting isAuthenticated from ${isAuthenticated} to true`);
    isAuthenticated = true;

    // $effect ではなく明示的に判定関数を呼び出す
    scheduleLoadIfNeeded({ authenticated: true });
    logger.info(`handleAuthSuccess: scheduleLoadIfNeeded triggered`);
}

// 認証ログアウト時の処理
function handleAuthLogout() {
    logger.info("ログアウトしました");
    isAuthenticated = false;
}

// プロジェクトとページを読み込む
async function loadProjectAndPage() {
    logger.info(`loadProjectAndPage: Starting for project="${projectName}", page="${pageName}"`);
    __loadingInProgress = true;
    isLoading = true;
    error = undefined;
    pageNotFound = false;

    // E2E stability: Brief pause to allow parallel page navigation to set yjsStore first
    // If no client exists after a short wait, create a new one rather than blocking indefinitely
    let waitCount = 0;
    const maxBriefWait = 5; // 0.5 seconds max wait
    while (!yjsStore.yjsClient && waitCount < maxBriefWait) {
        await new Promise(r => setTimeout(r, 100));
        waitCount++;
    }
    if (waitCount > 0) {
        logger.info(`loadProjectAndPage: Waited ${waitCount * 100}ms for existing yjsStore.yjsClient`);
    }
    // If no client exists after brief wait, proceed to create/get one (don't wait forever)

    // 即時に仮プロジェクト/ページを用意して UI 待機を満たす（本接続が来たら yjsStore が置換）
    // REMOVED: Legacy provisional project creation. We now wait for the real project to load via Yjs.


            logger.info(`loadProjectAndPage: Set isLoading=true, calling getYjsClientByProjectTitle`);

    try {
        // コンテナを読み込む
        // E2E stability: Check yjsStore FIRST before registry lookup to ensure we reuse existing client
        let client = yjsStore.yjsClient as any;
        if (client) {
            const existingProject = client.getProject?.();
            if (existingProject && existingProject.title === projectName) {
                logger.info(`loadProjectAndPage: Reusing existing yjsStore client for "${projectName}"`);
            } else {
                client = null; // Client exists but for different project
                logger.info(`loadProjectAndPage: yjsStore client exists but project mismatch, checking registry`);
            }
        }

        // If not found in yjsStore, check registry
        if (!client) {
            logger.info(`loadProjectAndPage: Calling getYjsClientByProjectTitle("${projectName}")`);
            client = await getYjsClientByProjectTitle(projectName);
        }

        // Last resort: create new client if not found anywhere
        if (!client) {
            try {
                logger.info(`loadProjectAndPage: No client found, creating new Yjs project: ${projectName}`);
                client = await createNewYjsProject(projectName);
            } catch (e) {
                logger.warn("loadProjectAndPage: createNewYjsProject failed", e);
            }
        }
        logger.info(`loadProjectAndPage: YjsClient loaded for project: ${projectName}`);
        logger.info(`loadProjectAndPage: Client containerId: ${client?.containerId}`);

        // クライアントストアを更新（undefined の場合は既存値を保持してクリアしない）
        logger.info(`loadProjectAndPage: Setting yjsStore.yjsClient when available`);
        logger.info(`loadProjectAndPage: Client before setting: containerId=${client?.containerId}, clientId=${client?.clientId}`);
        if (client) {
            yjsStore.yjsClient = client as any;
            try {
                // Ensure global store has the project set for tests that rely on window.generalStore.project
                const proj = client.getProject?.();
                if (proj) {
                    let appliedPendingImport = false;
                    let pendingImport: any[] | null = null;
                    try {
                        try {
                            const win: any = window as any;
                            const byTitle = win?.__PENDING_IMPORTS__;
                            if (byTitle) {
                                const keys = Object.keys(byTitle);
                                logger.info("loadProjectAndPage: Pending import keys", { keys: JSON.stringify(keys) });
                                logger.info("loadProjectAndPage: Pending import key comparison", {
                                    projectName,
                                    firstKey: keys[0],
                                    matches: keys.includes(projectName),
                                });
                            } else {
                                logger.info("loadProjectAndPage: No pending import map present");
                            }
                            if (byTitle && byTitle[projectName]) {
                                pendingImport = byTitle[projectName];
                                delete byTitle[projectName];
                            }
                        } catch {}
                        const key = `outliner:pending-import:${encodeURIComponent(projectName)}`;
                        try {
                            const raw = window.sessionStorage?.getItem(key) ?? window.localStorage?.getItem(key);
                            if (raw) {
                                pendingImport = JSON.parse(raw);
                                window.sessionStorage?.removeItem(key);
                                window.localStorage?.removeItem(key);
                            }
                        } catch {}

                        if (Array.isArray(pendingImport) && pendingImport.length > 0) {
                            const projectItems: any = proj.items as any;
                            const findPage = (title: string) => {
                                const len = projectItems?.length ?? 0;
                                for (let index = 0; index < len; index++) {
                                    const page = projectItems.at ? projectItems.at(index) : projectItems[index];
                                    const text = page?.text?.toString?.() ?? String(page?.text ?? "");
                                    if (text === title) return page;
                                }
                                return null;
                            };
                            const populate = (nodes: any[], targetItems: any) => {
                                if (!targetItems) return;
                                // Check if targetItems is a Yjs Array before calling removeAt
                                if (typeof targetItems.removeAt === "function") {
                                    while ((targetItems.length ?? 0) > 0) {
                                        targetItems.removeAt(targetItems.length - 1);
                                    }
                                } else if (Array.isArray(targetItems) && typeof targetItems.splice === "function") {
                                    // If it's a regular array, use splice to clear it
                                    targetItems.splice(0, targetItems.length);
                                }
                                for (const nodeData of nodes) {
                                    const text = nodeData?.text ?? "";
                                    const children = Array.isArray(nodeData?.children) ? nodeData.children : [];
                                    const node = targetItems.addNode?.("snapshot");
                                    if (!node) continue;
                                    node.updateText?.(text);
                                    populate(children, node?.items as any);
                                }
                            };
                            for (const root of pendingImport) {
                                const title = root?.text ?? "";
                                if (!title) continue;
                                let pageNode = findPage(title);
                                if (!pageNode) {
                                    pageNode = proj.addPage(title, "snapshot");
                                }
                                populate(root?.children ?? [], pageNode?.items as any);
                            }
                            appliedPendingImport = true;
                            logger.info("loadProjectAndPage: Applied pending import tree to connected project", { projectName });
                        } else {
                            logger.info("loadProjectAndPage: No pending import data", { projectName });
                        }
                    } catch (pendingError) {
                        logger.warn("loadProjectAndPage: Failed to apply pending import", pendingError);
                    }

                    try {
                        logger.info("loadProjectAndPage: Pending import candidate", {
                            hasData: typeof pendingImport !== 'undefined' && Array.isArray(pendingImport),
                            length: (typeof pendingImport !== 'undefined' && Array.isArray(pendingImport)) ? pendingImport.length : null,
                            sample: (typeof pendingImport !== 'undefined' && Array.isArray(pendingImport)) ? JSON.stringify(pendingImport) : null,
                        });
                        const snapshot = loadProjectSnapshot(projectName);
                        if (!appliedPendingImport && snapshot && Array.isArray(snapshot.items) && snapshot.items.length > 0) {
                            const projectItems: any = proj.items as any;

                            const getTitle = (page: any) => page?.text?.toString?.() ?? String(page?.text ?? "");

                            // Remove pages not present in snapshot to avoid stale placeholders
                            // [REMOVED] This logic was causing data loss when the snapshot was stale (e.g. during E2E tests)
                            // The snapshot should only be used to hydrate missing data, not to enforce strict equality.
                            /*
                            for (let index = (projectItems?.length ?? 0) - 1; index >= 0; index--) {
                                const existing = projectItems.at ? projectItems.at(index) : projectItems[index];
                                if (!existing) continue;
                                const title = getTitle(existing);
                                if (!snapshotTitles.has(title)) {
                                    projectItems.removeAt?.(index);
                                }
                            }
                            */

                            const populateChildren = (children: any[], targetItems: any) => {
                                if (!targetItems) return;
                                // Check if targetItems is a Yjs Array before calling removeAt
                                if (typeof targetItems.removeAt === "function") {
                                    while ((targetItems.length ?? 0) > 0) {
                                        targetItems.removeAt(targetItems.length - 1);
                                    }
                                } else if (Array.isArray(targetItems) && typeof targetItems.splice === "function") {
                                    // If it's a regular array, use splice to clear it
                                    targetItems.splice(0, targetItems.length);
                                }
                                for (const child of children ?? []) {
                                    const node = targetItems.addNode?.("snapshot");
                                    if (!node) continue;
                                    node.updateText?.(child?.text ?? "");
                                    populateChildren(child?.children ?? [], node?.items as any);
                                }
                            };

                            for (const root of snapshot.items) {
                                const title = root?.text ?? "";
                                if (!title) continue;
                                let pageNode: any = null;
                                const existingCount = projectItems?.length ?? 0;
                                for (let idx = 0; idx < existingCount; idx++) {
                                    const candidate = projectItems.at ? projectItems.at(idx) : projectItems[idx];
                                    if (!candidate) continue;
                                    if (getTitle(candidate) === title) {
                                        pageNode = candidate;
                                        break;
                                    }
                                }
                                if (!pageNode) {
                                    pageNode = proj.addPage(title, "snapshot");
                                } else {
                                    pageNode.updateText?.(title);
                                }
                                populateChildren(root?.children ?? [], pageNode?.items as any);
                            }
                        }
                    } catch (snapshotError) {
                        logger.warn("loadProjectAndPage: Failed to hydrate project from snapshot", snapshotError);
                    }

                    store.project = proj as any;
                    logger.info(`loadProjectAndPage: store.project set from client (title="${proj?.title}")`);

                    // After Yjs client attach: ensure requested page exists in CONNECTED project
                    try {
                        const itemsAny: any = (store.project as any).items as any;
                        const findPage = (items: any, title: string) => {
                            if (!items) return null;
                            try {
                                // Try iterator if available for more robust iteration
                                if (typeof items[Symbol.iterator] === 'function') {
                                    for (const p of items) {
                                        const t = p?.text?.toString?.() ?? String(p?.text ?? "");
                                        if (String(t).toLowerCase() === String(title).toLowerCase()) return p;
                                    }
                                    return null;
                                }
                            } catch {}

                            const len = items?.length ?? 0;
                            for (let i = 0; i < len; i++) {
                                const p = items.at ? items.at(i) : items[i];
                                const t = p?.text?.toString?.() ?? String(p?.text ?? "");
                                if (String(t).toLowerCase() === String(title).toLowerCase()) return p;
                            }
                            return null;
                        };
                        let pageRef: any = findPage(itemsAny, pageName);

                        // Debug: Log page lookup details in test env
                        const isTestEnv = (
                            import.meta.env.MODE === "test"
                            || import.meta.env.VITE_IS_TEST === "true"
                            || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
                        );
                        if (isTestEnv) {
                            const itemsCount = itemsAny?.length ?? 0;
                            logger.info(`E2E: Looking for page "${pageName}", items count: ${itemsCount}`);
                            for (let i = 0; i < Math.min(itemsCount, 5); i++) {
                                const p = itemsAny.at ? itemsAny.at(i) : itemsAny[i];
                                const t = p?.text?.toString?.() ?? String(p?.text ?? "");
                                const match = String(t).toLowerCase() === String(pageName).toLowerCase();
                                logger.info(`E2E: Item ${i}: "${t}" (match=${match})`);
                            }
                            if (!pageRef) {
                                logger.warn(`E2E: Page not found initially, will retry...`);
                            } else {
                                logger.info(`E2E: Page found initially`);
                            }
                        }

                        // Retry finding page to avoid duplicate creation during Yjs sync (Test Env only)

                        if (isTestEnv && !pageRef && pageName) {
                            logger.info(`E2E: Starting retry loop for page "${pageName}"`);
                            for (let i = 0; i < 100; i++) {
                                await new Promise(r => setTimeout(r, 200));
                                // Ensure store.project is set before accessing items
                                if (!store.project) {
                                    const gs = (window as any).generalStore;
                                    if (gs?.project) {
                                        store.project = gs.project as any;
                                        logger.info(`E2E: Synced store.project from generalStore`);
                                    } else {
                                        logger.info(`E2E: Retry ${i + 1}: store.project not set, gs.project also not set`);
                                        continue;
                                    }
                                }
                                // Re-fetch items from store.project as it might have updated
                                const currentItems = (store.project as any)?.items;
                                const itemsCount = currentItems?.length ?? 0;
                                pageRef = findPage(currentItems, pageName);
                                if (pageRef) {
                                    logger.info(`E2E: Found page "${pageName}" after retry ${i + 1}`);
                                    // Wait for page subdocument to be connected and items to be available
                                    // This ensures seeded content is properly synced before proceeding
                                    try {
                                        const pageId = pageRef?.id;
                                        const yjsClient = yjsStore.yjsClient;
                                        logger.info(`E2E: Checking page connection: pageId=${pageId}, yjsClient=${!!yjsClient}`);
                                        if (yjsClient && pageId) {
                                            const pageConn = yjsClient.getPageConnection?.(pageId);
                                            logger.info(`E2E: Initial pageConn check: pageConn=${!!pageConn}`);
                                            // Wait for page connection in the YjsClient
                                            for (let waitIter = 0; waitIter < 50; waitIter++) {
                                                const conn = yjsClient.getPageConnection?.(pageId);
                                                if (conn) {
                                                    // Check if the page has items (content is loaded)
                                                    const pageItems = pageRef?.items;
                                                    const itemCount = pageItems?.length ?? 0;
                                                    logger.info(`E2E: Page connected, checking items: count=${itemCount}`);
                                                    if (itemCount > 0) {
                                                        logger.info(`E2E: Page "${pageName}" connected with ${itemCount} items`);
                                                        break;
                                                    }
                                                    // If items are 0, trigger re-hydration to ensure seeded content is copied
                                                    if (itemCount === 0) {
                                                        logger.info(`E2E: Page connected but items=0, triggering re-hydration`);
                                                        try {
                                                            const projAny = store.project as any;
                                                            if (typeof projAny.hydratePageItems === "function") {
                                                                await projAny.hydratePageItems(pageId);
                                                                logger.info(`E2E: Re-hydration triggered for page ${pageId}`);
                                                            }
                                                        } catch (e) {
                                                            logger.warn(`E2E: Error during re-hydration: ${e}`);
                                                        }
                                                    }
                                                } else {
                                                    logger.info(`E2E: Waiting for page connection (iter ${waitIter}/50)`);
                                                }
                                                await new Promise(r => setTimeout(r, 100));
                                            }
                                        } else {
                                            logger.warn(`E2E: yjsClient or pageId not available`);
                                        }
                                    } catch (e) {
                                        logger.warn(`E2E: Error waiting for page connection: ${e}`);
                                    }
                                    break;
                                }
                                if ((i + 1) % 10 === 0) {
                                    // Log page titles every 10 retries
                                    logger.info(`E2E: Retry ${i + 1}: items count=${itemsCount}, page not found yet`);
                                    for (let j = 0; j < Math.min(itemsCount, 5); j++) {
                                        const p = currentItems.at ? currentItems.at(j) : currentItems[j];
                                        const t = p?.text?.toString?.() ?? String(p?.text ?? "");
                                        logger.info(`E2E:   Item ${j}: "${t}"`);
                                    }
                                }
                            }
                            if (!pageRef) {
                                logger.warn(`E2E: Failed to find page "${pageName}" after retries, trying fallback...`);
                                // Fallback: directly search in project's pages map
                                try {
                                    const projectAny = store.project as any;
                                    if (projectAny?.ydoc) {
                                        const pagesMap = projectAny.ydoc.getMap("pages");
                                        for (const [pageId] of pagesMap) {
                                            // Get the page item from project.items
                                            const itemsAny = projectAny.items as any;
                                            if (itemsAny) {
                                                for (let k = 0; k < (itemsAny.length ?? 0); k++) {
                                                    const item = itemsAny.at ? itemsAny.at(k) : itemsAny[k];
                                                    if (item?.id === pageId) {
                                                        // Verify title matches (case-insensitive)
                                                        const itemText = item?.text?.toString?.() ?? String(item?.text ?? "");
                                                        if (String(itemText).toLowerCase() === String(pageName).toLowerCase()) {
                                                            pageRef = item;
                                                            logger.info(`E2E: Found page via fallback search: "${itemText}" (id=${pageId})`);
                                                            // Wait for page subdocument to be connected and items to be available
                                                            try {
                                                                const yjsClient = yjsStore.yjsClient;
                                                                if (yjsClient && pageId) {
                                                                    for (let waitIter = 0; waitIter < 50; waitIter++) {
                                                                        const pageConn = yjsClient.getPageConnection?.(pageId);
                                                                        if (pageConn) {
                                                                            const pageItems = pageRef?.items;
                                                                            const itemCount = pageItems?.length ?? 0;
                                                                            if (itemCount > 0) {
                                                                                logger.info(`E2E: Page "${pageName}" connected with ${itemCount} items`);
                                                                                break;
                                                                            }
                                                                            // If items are 0, trigger re-hydration to ensure seeded content is copied
                                                                            if (itemCount === 0) {
                                                                                logger.info(`E2E: Fallback: Page connected but items=0, triggering re-hydration`);
                                                                                try {
                                                                                    if (typeof projectAny.hydratePageItems === "function") {
                                                                                        await projectAny.hydratePageItems(pageId);
                                                                                        logger.info(`E2E: Fallback: Re-hydration triggered for page ${pageId}`);
                                                                                    }
                                                                                } catch (e) {
                                                                                    logger.warn(`E2E: Fallback: Error during re-hydration: ${e}`);
                                                                                }
                                                                            }
                                                                        }
                                                                        await new Promise(r => setTimeout(r, 100));
                                                                    }
                                                                }
                                                            } catch (e) {
                                                                logger.warn(`E2E: Error waiting for page connection in fallback: ${e}`);
                                                            }
                                                            break;
                                                        }
                                                    }
                                                }
                                            }
                                            if (pageRef) break;
                                        }
                                    }
                                } catch (e) {
                                    logger.warn(`E2E: Fallback search failed: ${e}`);
                                }
                                if (!pageRef) logger.warn(`E2E: Failed to find page "${pageName}" even with fallback`);
                            }
                        }

                        if (pageRef) {
                            // Capture current provisional page BEFORE switching, to migrate its children if needed
                            const prevCurrent: any = (store.currentPage as any);
                            // Move currentPage to the connected project's page
                            try {
                                const cur = prevCurrent;
                                const sameDoc = !!(cur?.ydoc && pageRef?.ydoc && cur.ydoc === pageRef.ydoc);
                                if (!sameDoc || cur?.id !== pageRef?.id) {
                                    store.currentPage = pageRef as any;
                                }
                            } catch {}

                            // Hydrate page items from page subdoc's pageItems map
                            // This bridges the gap between how items are stored (in page subdoc) and how they're accessed (via page.items)
                            // Add retry logic to handle timing issues when subdoc hasn't finished syncing
                            try {
                                if (store.project && pageRef?.id) {
                                    const projAny = store.project as any;
                                    if (typeof projAny.hydratePageItems === "function") {
                                        let hydrationItemCount = 0;
                                        // Skip hydration if already done for this page to prevent duplicates
                                        // Also check inside the retry loop to prevent hydration on each iteration
                                        const isAlreadyHydrated = _hydratedPages.has(pageRef.id);
                                        if (isAlreadyHydrated) {
                                            logger.info(`loadProjectAndPage: Skipping hydration for already-hydrated page ${pageRef.id}`);
                                        } else {
                                            // Retry hydration until items are present (handles subdoc sync timing)
                                            const maxHydrationRetries = 10;
                                            for (let hRetry = 0; hRetry < maxHydrationRetries; hRetry++) {
                                                // Double-check hydration status before each attempt
                                                if (_hydratedPages.has(pageRef.id)) {
                                                    logger.info(`loadProjectAndPage: Skipping hydration retry ${hRetry + 1} - page ${pageRef.id} already hydrated`);
                                                    break;
                                                }
                                                // Get fresh page ref and items count each iteration
                                                const freshPageBefore = projAny.findPage(pageRef.id);
                                                if (!freshPageBefore) {
                                                    logger.warn(`loadProjectAndPage: Page ${pageRef.id} not found during hydration retry ${hRetry + 1}`);
                                                    await new Promise(r => setTimeout(r, 200));
                                                    continue;
                                                }
                                                await projAny.hydratePageItems(pageRef.id);
                                                // Give time for hydration to take effect
                                                await new Promise(r => setTimeout(r, 200));
                                                // Get FRESH page ref after hydration to see the updated items
                                                const freshPage = projAny.findPage(pageRef.id);
                                                const itemsAfter = (freshPage as any).items?.length ?? 0;
                                                // Get page items directly from subdoc to verify
                                                let subdocItemCount = 0;
                                                try {
                                                    const pagesMap = projAny.ydoc.getMap("pages");
                                                    const subdoc = pagesMap.get(pageRef.id);
                                                    if (subdoc) {
                                                        const pageItems = subdoc.getMap("pageItems");
                                                        const keys = Array.from(pageItems.keys()).filter(k => k !== "initialized");
                                                        subdocItemCount = keys.length;
                                                    }
                                                } catch {}
                                                logger.info(`loadProjectAndPage: Hydration attempt ${hRetry + 1}: pageItems=${itemsAfter}, subdocPageItems=${subdocItemCount}`);
                                                if (itemsAfter >= 3 && subdocItemCount > 0) {
                                                    // We have enough items and subdoc has data - now mark as hydrated
                                                    _hydratedPages.add(pageRef.id);
                                                    hydrationItemCount = itemsAfter;
                                                    logger.info(`loadProjectAndPage: Successfully hydrated page ${pageRef.id} (items: ${itemsAfter}, subdocItems: ${subdocItemCount})`);
                                                    break;
                                                }
                                                // Only mark as hydrated if we have items (hydration succeeded)
                                                if (itemsAfter > 0) {
                                                    _hydratedPages.add(pageRef.id);
                                                }
                                                if (hRetry === maxHydrationRetries - 1) {
                                                    logger.warn(`loadProjectAndPage: Hydration timed out for page ${pageRef.id} (items: ${itemsAfter}, subdocItems: ${subdocItemCount})`);
                                                }
                                            }
                                        }
                                        if (hydrationItemCount > 0) {
                                            // Get the fresh page reference after hydration to ensure we have the updated items
                                            const hydratedPageRef = projAny.findPage(pageRef.id);
                                            if (hydratedPageRef) {
                                                store.currentPage = hydratedPageRef as any;
                                            } else {
                                                store.currentPage = pageRef as any;
                                            }
                                        }
                                    }
                                }
                            } catch (e) {
                                logger.warn("loadProjectAndPage: Failed to hydrate page items", e);
                            }
                            // Migrate pre-attached seeded children from provisional page to connected page if needed
                            try {
                                const prev: any = prevCurrent;
                                const next: any = pageRef;
                                const isDifferentDoc = !!(prev?.ydoc && next?.ydoc && prev.ydoc !== next.ydoc);
                                if (isDifferentDoc) {
                                    for (let attempt = 0; attempt < 20; attempt++) {
                                        const prevLen = prev?.items?.length ?? 0;
                                        const nextLen = next?.items?.length ?? 0;
                                        // Skip migration if destination already has items (they were likely hydrated from seeded subdoc)
                                        // This prevents duplicate items when both hydration and migration try to add content
                                        const shouldReplaceChildren = prevLen > 0 && nextLen === 0;
                                        if (shouldReplaceChildren) {
                                            const mapId = (fromId: string | undefined, toId: string | undefined) => {
                                                if (!fromId || !toId) return;
                                                try {
                                                    const w:any = (typeof window !== "undefined") ? (window as any) : null;
                                                    if (!w) return;
                                                    if (!w.__ITEM_ID_MAP__) w.__ITEM_ID_MAP__ = {};
                                                    w.__ITEM_ID_MAP__[String(fromId)] = String(toId);
                                                } catch {}
                                            };
                                            const copyAttachments = (sourceNode: any, targetNode: any) => {
                                                try {
                                                    const srcAtt: any = sourceNode?.attachments;
                                                    const arr: any[] = srcAtt?.toArray ? srcAtt.toArray() : (Array.isArray(srcAtt) ? srcAtt : []);
                                                    for (const entry of arr) {
                                                        const url = Array.isArray(entry) ? entry[0] : entry;
                                                        targetNode?.addAttachment?.(url);
                                                    }
                                                } catch {}
                                            };
                                            const cloneBranch = (sourceItems: any, targetItems: any) => {
                                                if (!sourceItems || !targetItems) return;
                                                const length = sourceItems?.length ?? 0;
                                                for (let index = 0; index < length; index++) {
                                                    const srcNode = sourceItems.at ? sourceItems.at(index) : sourceItems[index];
                                                    if (!srcNode) continue;
                                                    const text = srcNode?.text?.toString?.() ?? String(srcNode?.text ?? "");
                                                    const destNode = targetItems?.addNode?.("tester");
                                                    if (!destNode) continue;
                                                    destNode.updateText?.(text);
                                                    mapId((srcNode as any)?.id, (destNode as any)?.id);
                                                    copyAttachments(srcNode, destNode);
                                                    cloneBranch(srcNode?.items as any, destNode?.items as any);
                                                }
                                            };

                                            while ((next?.items?.length ?? 0) > 0) {
                                                next.items.removeAt(next.items.length - 1);
                                            }
                                            cloneBranch(prev.items as any, next.items as any);
                                            logger.info("E2E: Migrated provisional page children to connected page");
                                            break;
                                        }
                                        // wait for potential late seeding in provisional doc
                                        await new Promise(r => setTimeout(r, 250));
                                    }
                                }
                            } catch {}

                            try {
                                const win: any = window as any;
                                const pendingMap = win?.__PENDING_IMPORTS__;
                                let pendingPage: any = null;
                                if (Array.isArray(pendingImport)) {
                                    pendingPage = pendingImport.find((root: any) => root?.text === pageName);
                                }
                                if (!pendingPage && pendingMap && pendingMap[projectName]) {
                                    const entry = pendingMap[projectName];
                                    if (Array.isArray(entry)) {
                                        pendingPage = entry.find((root: any) => root?.text === pageName);
                                    }
                                }
                                if (pendingPage) {
                                    const applyChildren = (nodes: any[], targetItems: any) => {
                                        if (!targetItems) return;
                                        while ((targetItems.length ?? 0) > 0) {
                                            targetItems.removeAt(targetItems.length - 1);
                                        }
                                        for (const nodeData of nodes ?? []) {
                                            const text = nodeData?.text ?? "";
                                            const child = targetItems.addNode?.("pending-import");
                                            if (!child) continue;
                                            child.updateText?.(text);
                                            applyChildren(nodeData?.children ?? [], child?.items as any);
                                        }
                                    };
                                    applyChildren(pendingPage?.children ?? [], pageRef?.items as any);
                                    if (pendingMap && pendingMap[projectName]) {
                                        delete pendingMap[projectName];
                                    }
                                    logger.info("loadProjectAndPage: Applied pending import to pageRef", { projectName, pageName });
                                }
                            } catch {}

                            // Ensure minimum lines exist in connected page for E2E stability
                            // Skip if SKIP_TEST_CONTAINER_SEED is set (e.g., during import tests)
                            // This block is intentionally removed - seeding is now only done in the second block below
                        }
                        // In test environment (unless SKIP_TEST_CONTAINER_SEED is set), ensure default lines exist
                        // REMOVED: Legacy seeding logic removed. Tests should seed their own data.
                    } catch (e) {
                        logger.warn("loadProjectAndPage: post-attach page resolve/migration failed", e);
                    }
                }
            } catch (e) {
                logger.warn("loadProjectAndPage: failed to set store.project from client", e);
            }
        } else {
            logger.warn("loadProjectAndPage: getYjsClientByProjectTitle returned undefined; keeping existing yjsClient");
            // Try to set store.project from existing yjsStore client as a fallback
            try {
                const proj = yjsStore.yjsClient?.getProject?.();
                if (proj) {
                    store.project = proj as any;
                    logger.info(`loadProjectAndPage: store.project set from existing yjsStore client (title="${proj?.title}")`);
                }
            } catch {}
        }
        logger.info(`loadProjectAndPage: YjsStore updated with client`);
        logger.info(`loadProjectAndPage: yjsStore.yjsClient exists: ${!!yjsStore.yjsClient}`);
        logger.info(`loadProjectAndPage: yjsStore.yjsClient containerId: ${yjsStore.yjsClient?.containerId}`);

        // グローバルストアの状態をログ出力
        if (typeof window !== "undefined") {
            const globalStore = (window as any).generalStore;
            logger.info(`Global generalStore exists: ${!!globalStore}`);
            if (globalStore) {
                logger.info(`generalStore.project exists: ${!!globalStore.project}`);
                logger.info(`generalStore.pages exists: ${!!globalStore.pages}`);

                        // Final safety: even if SKIP_TEST_CONTAINER_SEED is true, ensure at least some children exist for E2E stability
                        // REMOVED: Legacy seeding logic removed.

                logger.info(`generalStore.currentPage exists: ${!!globalStore.currentPage}`);
                logger.info(`generalStore === store: ${globalStore === store}`);
            }
        }

        // プロジェクトの設定を待つ
        let retryCount = 0;
        const maxRetries = 20; // リトライ回数を増やす
        while (!store.project && retryCount < maxRetries) {
            logger.info(`Waiting for store.project to be set... retry ${retryCount + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, 200)); // 待機時間を増やす
            retryCount++;
        }

        logger.info(`Store.project exists: ${!!store.project}`);
        logger.info(`Store.pages exists: ${!!store.pages}`);

        // store.pagesの設定も待つ
        retryCount = 0;
        while (!store.pages && retryCount < maxRetries) {
            logger.info(`Waiting for store.pages to be set... retry ${retryCount + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, 200));
            retryCount++;
        }

        if (store.project) {
            logger.info(`Project title: "${store.project.title}"`);
            const items = store.project.items as any;
            logger.info(`Project items count: ${items?.length || 0}`);
            if (projectLooksLikePlaceholder(store.project)) {
                const snapshot = loadProjectSnapshot(projectName);
                if (snapshot) {
                    const hydrated = snapshotToProject(snapshot);
                    store.project = hydrated as any;
                    if (!yjsStore.yjsClient) {
                        try {
                            yjsStore.yjsClient = createSnapshotClient(projectName, hydrated) as any;
                        } catch {}
                    }
                    try {
                        const pages: any = hydrated.items as any;
                        const len = pages?.length ?? 0;
                        let target: any = null;
                        for (let i = 0; i < len; i++) {
                            const p = pages.at ? pages.at(i) : pages[i];
                            const title = p?.text?.toString?.() ?? String(p?.text ?? "");
                            if (title === pageName) {
                                target = p;
                                break;
                            }
                        }
                        if (!target && len > 0) {
                            target = pages.at ? pages.at(0) : pages[0];
                        }
                        if (target) {
                            store.currentPage = target as any;
                        }
                    } catch {}
                }
            }
        }

        // ページの読み込み完了をログ出力
        if (store.pages) {
            logger.info(`Available pages count: ${store.pages.current.length}`);
            {
                const arr: any = store.pages.current as any;
                const len = arr?.length ?? 0;
                for (let i = 0; i < len; i++) {
                    const p = arr?.at ? arr.at(i) : arr[i];
                    const title = (p?.text as any)?.toString?.() ?? String((p as any)?.text ?? "");
                    logger.info(`Page ${i}: "${title}"`);
                }
            }
        }

        // E2E 安定化: ページ一覧が空で、テスト環境かつ URL にページ名がある場合は
        // リクエストされたページを暫定的に作成して以降の処理を安定させる


        // 必要なら currentPage をここでフォールバック設定（+layout に依存しすぎない）
        if (store.pages && !store.currentPage) {
            try {
                const arr: any = store.pages.current as any;
                const len = arr?.length ?? 0;
                for (let i = 0; i < len; i++) {
                    const p = arr?.at ? arr.at(i) : arr[i];
                    const title = (p?.text as any)?.toString?.() ?? String((p as any)?.text ?? "");
                    if (title.toLowerCase() === String(pageName).toLowerCase()) {
                        store.currentPage = p;
                        logger.info(`Fallback: store.currentPage set in +page.svelte to "${title}" (id=${p?.id})`);
                        break;
                    }
                }
                // ページが見つからない場合、Yjsの同期を待つ（コラボレーションテスト用）
                if (!store.currentPage) {
                    console.log(`[+page.svelte] Fallback: Page "${pageName}" not found, waiting for Yjs sync...`);
                }
            } catch (e) {
                console.error("Failed to set currentPage fallback:", e);
            }
        }

        // (removed) pre-attach seeding: keep seeding only after Yjs client attach

        if (!store.pages) {
            pageNotFound = true;
            logger.warn("No pages available - store.pages is null/undefined");
            logger.warn(`store.project exists: ${!!store.project}`);
            if (store.project) {
                logger.warn(`store.project.items exists: ${!!store.project.items}`);
                const items = store.project.items as any;
                logger.warn(`store.project.items length: ${items?.length || 0}`);
            }
        }
    }
    catch (err) {
        console.error("Failed to load project and page:", err);
        error = err instanceof Error
            ? err.message
            : "プロジェクトとページの読み込み中にエラーが発生しました。";
    }
    finally {
        isLoading = false;
        __loadingInProgress = false;
        // Export to window for child pages to trigger load
        if (typeof window !== "undefined") {
            (window as any).loadProjectAndPage = loadProjectAndPage;
            (window as any).__loadingInProgress = __loadingInProgress;
            // E2E stability: Also export the current YjsClient for child pages to access
            if (yjsStore.yjsClient) {
                (window as any).__YJS_CLIENT__ = yjsStore.yjsClient;
                console.log("[+page.svelte] Exported YjsClient to window:", yjsStore.yjsClient.containerId);
            }
        }
        // b schedule page d: 5B URL 5B /schedule 5D 5b5D 班级
        try { capturePageIdForSchedule(); } catch {}
    }
}

onMount(() => {
    try {
        // DIRECT DEBUG: This should appear if onMount is called
        if (typeof console !== 'undefined') {
            console.log("[DEBUG] onMount called");
        }
        // 初期ロードを試行
        scheduleLoadIfNeeded();
    } catch (e) {
        console.error("[DEBUG] onMount error:", e);
    }

    // E2E安定化: currentPage.items の初期生成を追跡して pageId を随時キャプチャ
    try {
        let tries = 0;
        const iv = setInterval(() => {
            try {
                capturePageIdForSchedule();
                const pg: any = store.currentPage as any;
                const len = pg?.items?.length ?? 0;
                if (len > 0 || ++tries > 50) {
                    clearInterval(iv);
                }
            } catch {
                if (++tries > 50) clearInterval(iv);
            }
        }, 100);
        onDestroy(() => { try { clearInterval(iv); } catch {} });
    } catch {}

    // コラボレーションテスト用: Yjsの同期を待つ
    // SKIP_TEST_CONTAINER_SEED=trueの場合でも、ページの同期を待つ必要がある
    const isTestEnv = import.meta.env.MODE === "test"
        || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
        || (typeof window !== "undefined" && (window as any).__E2E__ === true);
    if (isTestEnv && store.project) {
        // Test mode: waiting for Yjs sync
        console.log(`[+page.svelte] onMount: Test mode, waiting for Yjs sync...`);
        console.log(`[+page.svelte] onMount: store.currentPage=${!!store.currentPage}, pageName="${pageName}"`);
        if (!store.currentPage) {
            const itemsAny: any = (store.project as any).items as any;
            // Use async function for proper await support
            (async () => {
                for (let retry = 0; retry < 20; retry++) {
                    await new Promise(r => setTimeout(r, 500));
                    const currentLen = itemsAny?.length ?? 0;
                    for (let i = 0; i < currentLen; i++) {
                        const p = itemsAny.at ? itemsAny.at(i) : itemsAny[i];
                        const title = p?.text?.toString?.() ?? String(p?.text ?? "");
                        if (String(title).toLowerCase() === String(pageName).toLowerCase()) {
                            store.currentPage = p as any;
                            console.log(`[+page.svelte] Found page via Yjs sync: ${title} (id=${p?.id})`);
                            // Wait for page subdocument to be connected and items to be available
                            try {
                                const yjsClient = yjsStore.yjsClient;
                                const pageId = p?.id;
                                console.log(`[+page.svelte] Checking page connection: pageId=${pageId}, yjsClient=${!!yjsClient}`);
                                if (yjsClient && pageId) {
                                    const pageConn = yjsClient.getPageConnection?.(pageId);
                                    console.log(`[+page.svelte] Initial pageConn check: pageConn=${!!pageConn}`);
                                    for (let waitIter = 0; waitIter < 50; waitIter++) {
                                        const conn = yjsClient.getPageConnection?.(pageId);
                                        if (conn) {
                                            const pageItems = p?.items;
                                            const itemCount = pageItems?.length ?? 0;
                                            console.log(`[+page.svelte] Page connected, checking items: count=${itemCount}`);
                                            if (itemCount > 0) {
                                                console.log(`[+page.svelte] Page "${pageName}" connected with ${itemCount} items`);
                                                break;
                                            }
                                        } else {
                                            console.log(`[+page.svelte] Waiting for page connection (iter ${waitIter}/50)`);
                                        }
                                        await new Promise(r => setTimeout(r, 100));
                                    }
                                }
                            } catch (e) {
                                console.warn(`[+page.svelte] Error waiting for page connection in onMount: ${e}`);
                            }
                            return;
                        }
                    }
                }
                console.warn(`[+page.svelte] Page not found after retries: ${pageName}`);
            })();
        } else {
            console.log(`[+page.svelte] onMount: store.currentPage already set, skipping search`);
        }
    }

    // E2E 環境では、最小限のページを先行準備して UI テストを安定させる
    // Auto-create logic removed - data seeding now handled by SeedClient in E2E tests
    try {
        if (isTestEnv && store.project) {
            console.log(`[+page.svelte] onMount: store.currentPage=${!!store.currentPage}, pageName="${pageName}"`);
            if (!store.currentPage) {
                const itemsAny: any = (store.project as any).items as any;
                const len = itemsAny?.length ?? 0;
                console.log(`[+page.svelte] onMount: Searching for page in ${len} items`);
                // 既存ページ検索（タイトル一致）
                let found: any = null;
                for (let i = 0; i < len; i++) {
                    const p = itemsAny.at ? itemsAny.at(i) : itemsAny[i];
                    const title = p?.text?.toString?.() ?? String(p?.text ?? "");
                    if (String(title).toLowerCase() === String(pageName).toLowerCase()) {
                        found = p;
                        console.log(`[+page.svelte] onMount: Found existing page "${title}" (id=${p?.id})`);
                        break;
                    }
                }
                if (found) {
                    store.currentPage = found as any;
                    console.log(`[+page.svelte] onMount: Set currentPage to existing page: ${found?.text?.toString?.()} (id=${found?.id})`);
                }
            } else {
                console.log(`[+page.svelte] onMount: store.currentPage already set, skipping search`);
            }
        }
    } catch {}
    // ルートパラメータの変化を監視
    const unsub = page.subscribe(($p) => {
        const pj = $p.params?.project ?? projectName;
        const pg = $p.params?.page ?? pageName;
        scheduleLoadIfNeeded({ project: pj, page: pg });
    });
    onDestroy(unsub);
});
// スケジュール連携用: 現在のページから pageId 候補をセッションに保存
function capturePageIdForSchedule() {
    try {
        if (typeof window === "undefined") return;
        const pg: any = store.currentPage as any;
        if (!pg) return;
        
        // Always use the page ID itself, not its children
        // This ensures consistency regardless of page content (empty vs populated)
        const id = pg.id;
        
        if (id) {
            const key = `schedule:lastPageChildId:${encodeURIComponent(projectName)}:${encodeURIComponent(pageName)}`;
            window.sessionStorage?.setItem(key, String(id));
            console.log("[+page.svelte] capturePageIdForSchedule saved:", key, id);
        }
    } catch {}
}

// ホームに戻る
function goHome() {
    goto("/");
}

// プロジェクトページに戻る
function goToProject() {
    goto(`/${projectName}`);
}

function goToSchedule() {
    goto(`/${projectName}/${pageName}/schedule`);
}

function goToGraphView() {
    goto(`/${projectName}/graph`);
}

// 画面上部からもアイテムを追加できる補助ボタン（E2E安定化用）
function addItemFromTopToolbar() {
    try {
        let pageItem: any = store.currentPage as any;
        // currentPage が未用意なら、URL の pageName で暫定ページを作成
        if (!pageItem) {
            const proj: any = store.project as any;
            if (proj?.addPage && pageName) {
                try {
                    const created = proj.addPage(pageName, "tester");
                    if (created) {
                        store.currentPage = created as any;
                        pageItem = created;
                    }
                } catch {}
            }
        }
        if (!pageItem || !pageItem.items) return;
        const user = userManager.getCurrentUser()?.id ?? "tester";
        const node = pageItem.items.addNode(user);
        // 追加直後にアクティブ化してテストの後工程を安定
        if (node && node.id) {
            editorOverlayStore.setCursor({ itemId: node.id, offset: 0, isActive: true, userId: "local" });
            editorOverlayStore.setActiveItem(node.id);
        }
    } catch (e) {
        console.warn("addItemFromTopToolbar failed", e);
    }
}

// 検索パネルの表示を切り替える
function toggleSearchPanel() {
    const before = isSearchPanelVisible;
    isSearchPanelVisible = !isSearchPanelVisible;
    if (typeof window !== "undefined") {
        (window as any).__SEARCH_PANEL_VISIBLE__ = isSearchPanelVisible;
    }
    logger.debug("toggleSearchPanel called", { before, after: isSearchPanelVisible });
}

onMount(async () => {
    // UserManagerの認証状態を確認（非同期対応）
    logger.info(`onMount: Starting for project="${projectName}", page="${pageName}"`);
    logger.info(`onMount: URL params - projectName: "${projectName}", pageName: "${pageName}"`);

    // 初期認証状態を確認
    let currentUser = userManager.getCurrentUser();
    logger.info(`onMount: Initial auth check - currentUser exists: ${!!currentUser}`);
    logger.info(`onMount: UserManager instance exists: ${!!userManager}`);

    if (currentUser) {
        isAuthenticated = true;
        logger.info("onMount: User already authenticated, setting isAuthenticated=true");
        // YJS client initialization is handled by scheduleLoadIfNeeded via loadProjectAndPage
        // No duplicate initialization needed here
    }
    else {
        // 認証状態が変更されるまで待機（テスト環境対応）
        logger.info("onMount: No current user, waiting for authentication...");
        let retryCount = 0;
        const maxRetries = 50; // 5秒間待機

        while (!currentUser && retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 100));
            currentUser = userManager.getCurrentUser();
            retryCount++;

            if (retryCount % 10 === 0) {
                logger.info(`onMount: Auth check retry ${retryCount}/${maxRetries}`);
            }
        }

        if (currentUser) {
            isAuthenticated = true;
            logger.info(`onMount: Authentication detected after ${retryCount} retries, setting isAuthenticated=true`);
            // YJS client initialization is handled by scheduleLoadIfNeeded via loadProjectAndPage
            // No duplicate initialization needed here
        }
        else {
            logger.info("onMount: No authentication detected after retries, staying unauthenticated");
        }
    }

    logger.info(`onMount: Final authentication status: ${isAuthenticated}`);
    logger.info(`onMount: About to complete, $effect should trigger with isAuthenticated=${isAuthenticated}`);

    // E2E デバッグ用: 検索パネルを強制的に開く関数を公開
    if (typeof window !== "undefined") {
        (window as any).__OPEN_SEARCH__ = async () => {
            // 現在非表示のときだけトグルボタンをクリックして開く（二重トグル防止）
            if (!isSearchPanelVisible) {
                const btn = document.querySelector<HTMLButtonElement>(".search-btn");
                btn?.click();
            }
            // search-panel の DOM 出現を待機
            let tries = 0;
            while (!document.querySelector('[data-testid="search-panel"]') && tries < 40) {
                await new Promise(r => setTimeout(r, 25));
                tries++;
            }
            (window as any).__SEARCH_PANEL_VISIBLE__ = true;
            logger.debug("E2E: __OPEN_SEARCH__ ensured visible (no double toggle)", { found: !!document.querySelector('[data-testid="search-panel"]'), tries });
        };
    }

    // ページ読み込み後にリンクプレビューハンドラーを設定
    // DOMが完全に読み込まれるのを待つ
    setTimeout(() => {
        setupLinkPreviewHandlers();
    }, 500);

    if (pageName) {
        searchHistoryStore.add(pageName);
    }
});

onDestroy(() => {
    // リンクプレビューのクリーンアップ
    cleanupLinkPreviews();
});
</script>

<svelte:head>
    <title>
        {pageName ? pageName : "ページ"} - {
            projectName
            ? projectName
            : "プロジェクト"
        } | Outliner
    </title>
</svelte:head>

<main class="container mx-auto px-4 py-4">
    <div class="mb-4">
        <!-- パンくずナビゲーション -->
        <nav class="mb-2 flex items-center text-sm text-gray-600">
            <button
                onclick={goHome}
                class="text-blue-600 hover:text-blue-800 hover:underline"
            >
                ホーム
            </button>
            {#if projectName}
                <span class="mx-2">/</span>
                <button
                    onclick={goToProject}
                    class="text-blue-600 hover:text-blue-800 hover:underline"
                >
                    {projectName}
                </button>
            {/if}
            {#if pageName}
                <span class="mx-2">/</span>
                <span class="text-gray-900">{pageName}</span>
            {/if}
        </nav>

        <!-- ページタイトルと検索ボタン -->
        <div class="flex items-center justify-between">
            <h1 class="text-2xl font-bold">
                {#if projectName && pageName}
                    <span class="text-gray-600">{projectName} /</span> {pageName}
                {:else}
                    ページ
                {/if}
            </h1>
            <div class="flex items-center space-x-2" data-testid="page-toolbar">

                <button
                    onclick={toggleSearchPanel}
                    class="search-btn px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    data-testid="search-toggle-button"
                >
                    検索
                </button>
                <button
                    onclick={addItemFromTopToolbar}
                    class="px-4 py-2 bg-slate-200 text-slate-800 rounded hover:bg-slate-300"
                >
                    アイテム追加
                </button>
                <button
                    onclick={goToSchedule}
                    class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                    予約管理
                </button>
                <button
                    onclick={goToGraphView}
                    data-testid="graph-view-button"
                    class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                >
                    グラフビュー
                </button>
            </div>
        </div>
    </div>

    <!-- 認証コンポーネント -->
    <div class="auth-section mb-6">
        <AuthComponent
            onAuthSuccess={handleAuthSuccess}
            onAuthLogout={handleAuthLogout}
        />
    </div>

    <!-- OutlinerBase は常にマウントし、内部で pageItem の有無に応じて表示を切り替える -->
    <OutlinerBase
        pageItem={store.currentPage}
        projectName={projectName || ""}
        pageName={pageName || ""}
        isReadOnly={false}
        isTemporary={store.currentPage ? store.currentPage.id.startsWith('temp-') : false}
        onEdit={undefined}
    />

    <!-- バックリンクパネル（仮ページのときは非表示） -->
    {#if store.currentPage && !store.currentPage.id.startsWith('temp-')}
        <BacklinkPanel {pageName} {projectName} />
    {/if}

    <!-- 検索パネル -->
    <SearchPanel
        isVisible={isSearchPanelVisible}
        pageItem={store.currentPage}
        project={store.project}
    />
    {#if isLoading}
        <div class="flex justify-center py-8">
            <div class="loader">読み込み中...</div>
        </div>
    {:else if error}
        <div class="rounded-md bg-red-50 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-red-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-red-800">
                        エラーが発生しました
                    </h3>
                    <div class="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                    </div>
                    <div class="mt-4">
                        <button
                            onclick={loadProjectAndPage}
                            class="rounded-md bg-red-100 px-2 py-1.5 text-sm font-medium text-red-800 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
                        >
                            再試行
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {:else if pageNotFound}
        <div class="rounded-md bg-yellow-50 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-yellow-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-yellow-800">
                        ページが見つかりません
                    </h3>
                    <div class="mt-2 text-sm text-yellow-700">
                        <p>
                            指定されたページ「{pageName}」はプロジェクト「{projectName}」内に存在しません。
                        </p>
                    </div>
                </div>
            </div>
        </div>
    {:else if !isAuthenticated}
        <div class="rounded-md bg-blue-50 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-blue-400">ℹ️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-blue-800">
                        ログインが必要です
                    </h3>
                    <div class="mt-2 text-sm text-blue-700">
                        <p>このページを表示するには、ログインしてください。</p>
                    </div>
                </div>
            </div>
        </div>
    {:else}
        <!-- no-op: avoid misleading SSR/hydration fallback message -->
    {/if}
</main>

<style>
.loader {
    border: 4px solid #f3f3f3;
    border-top: 4px solid #3498db;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    animation: spin 1s linear infinite;
    margin: 0 auto;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }
    100% {
        transform: rotate(360deg);
    }
}
</style>
