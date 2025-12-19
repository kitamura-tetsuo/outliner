<script lang="ts">
import { browser } from "$app/environment";
import { page } from "$app/stores";
import { onMount } from "svelte";
import { userManager } from "../../../auth/UserManager";
import { getLogger } from "../../../lib/logger";
import { getYjsClientByProjectTitle, createNewYjsProject } from "../../../services";
import { yjsStore } from "../../../stores/yjsStore.svelte";
import { store } from "../../../stores/store.svelte";

let { children } = $props();
const logger = getLogger("+layout([project]/[page])");

let projectName: string = $derived.by(() => $page.params.project ?? "");
let pageName: string = $derived.by(() => $page.params.page ?? "");

let isAuthenticated = $state(false);
let lastLoadKey: string | null = null;

function scheduleLoadIfNeeded(opts?: { project?: string; page?: string; authenticated?: boolean }) {
    if (!browser) return;
    const pj = (opts?.project ?? projectName) || "";
    const pg = (opts?.page ?? pageName) || "";
    const auth = opts?.authenticated ?? isAuthenticated;

    const isTestEnv = (
        import.meta.env.MODE === "test"
        || import.meta.env.VITE_IS_TEST === "true"
        || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
    );

    if (!pj || !pg || !(auth || isTestEnv)) {
        return;
    }

    const key = `${pj}::${pg}::${auth || isTestEnv}`;
    if (lastLoadKey === key) return;
    lastLoadKey = key;

    // Use a small delay to debounce but ensure that the LATEST request is the one that runs
    setTimeout(() => {
        if (lastLoadKey === key) {
            loadProjectAndPage();
        }
    }, 10);
}

async function loadProjectAndPage() {
    if (!browser) return;
    logger.info(`loadProjectAndPage: Starting for project="${projectName}", page="${pageName}"`);

    try {
        if (!store.project || store.project.title !== projectName) {
            const { Project } = await import("../../../schema/app-schema");
            const provisional = Project.createInstance(projectName);
            store.project = provisional as any;
        }
        // Set provisional currentPage immediately to avoid stale data from previous navigation
        if (pageName && (!store.currentPage || (store.currentPage.text?.toString?.().toLowerCase() !== pageName.toLowerCase()))) {
            const { Item } = await import("../../../schema/app-schema");
            const prov = new Item({ text: pageName });
            store.currentPage = prov as any;
            logger.info(`loadProjectAndPage: Set initial provisional currentPage for "${pageName}"`);
        }
    } catch {}

    try {
        let client = await getYjsClientByProjectTitle(projectName);
        if (!client) {
            client = await createNewYjsProject(projectName);
        }
        
        if (client) {
            yjsStore.yjsClient = client as any;
            const proj = client.getProject?.();
            if (proj) {
                store.project = proj as any;
                logger.info(`loadProjectAndPage: store.project set from client (title="${proj?.title}")`);

                // Wait for page resolution
                const itemsAny: any = (store.project as any)?.items;
                const findPage = (items: any, title: string) => {
                    if (!items) return null;
                    const normTitle = decodeURIComponent(title).toLowerCase();
                    try {
                        const arr = Array.from(items);
                        for (const p of arr) {
                            const t = (p as any)?.text?.toString?.() ?? String((p as any)?.text ?? "");
                            if (t.toLowerCase() === normTitle) return p;
                        }
                    } catch (e) {
                        logger.warn(`findPage: Array.from failed, falling back to manual loop: ${e}`);
                    }
                    const len = items?.length ?? 0;
                    for (let i = 0; i < len; i++) {
                        const p = items.at ? items.at(i) : items[i];
                        const t = p?.text?.toString?.() ?? String(p?.text ?? "");
                        if (t.toLowerCase() === normTitle) return p;
                    }
                    return null;
                };

                let pageRef: any = findPage(itemsAny, pageName);
                // E2E環境でのリトライループを削除し、Playwrightの待機機能に任せる
                if (!pageRef && pageName) {
                    const disableAuto = (typeof window !== "undefined" && (window as any).__DISABLE_AUTO_PAGE_CREATION__ === true);
                    if (!disableAuto && itemsAny?.addNode) {
                        pageRef = itemsAny.addNode("tester");
                        pageRef?.updateText?.(pageName);
                        logger.info(`loadProjectAndPage: Created requested page: "${pageName}"`);
                    }
                }

                if (pageRef) {
                    store.currentPage = pageRef;
                } else if (pageName) {
                    // Provisional fallthrough for navigation to start
                    const { Item } = await import("../../../schema/app-schema");
                    const prov = new Item({ text: pageName });
                    store.currentPage = prov as any;
                    logger.info(`loadProjectAndPage: Set provisional currentPage for "${pageName}"`);
                }
            }
        }
    } catch (e) {
        logger.error("loadProjectAndPage failed", e);
    }
}

onMount(() => {
    if (browser) {
        isAuthenticated = userManager.getCurrentUser() !== null;
        const unsub = userManager.addEventListener((user: any) => {
            isAuthenticated = user !== null;
            if (isAuthenticated) scheduleLoadIfNeeded({ authenticated: true });
        });
        
        // Router subscription
        const unsubPage = page.subscribe(($p) => {
            scheduleLoadIfNeeded({ project: $p.params.project, page: $p.params.page });
        });

        scheduleLoadIfNeeded();

        return () => {
            unsub();
            unsubPage();
        };
    }
});
</script>

{@render children()}
