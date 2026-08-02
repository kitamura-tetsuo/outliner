<script lang="ts">
    import { getLogger } from "$lib/logger";
    const logger = getLogger("Route");
import { page } from "$app/stores";
import { onMount, onDestroy } from "svelte";
import SnapshotDiffModal from "../../../../components/SnapshotDiffModal.svelte";
import Breadcrumb from "../../../../components/Breadcrumb.svelte";
import { exportItemToMarkdown, getYjsClientByProjectTitle, removeYjsClientByProjectId } from "../../../../services";
import { DEMO_PROJECT_NAME, seedDemo } from "../../../../lib/demoSeed";
import { Project as AppProject } from "../../../../schema/app-schema";
import { findPageByName } from "../../../../utils/pageUtils";
import { userManager } from "../../../../auth/UserManager";

let project = $state(DEMO_PROJECT_NAME);
let pageTitle = $state("");
let content = $state("");
let user = $derived(userManager.getCurrentUser()?.name ?? "Guest");

import type { YjsClient } from "../../../../yjs/YjsClient";
let currentClient: YjsClient | null = null;
let updateObserver: (() => void) | null = null;
let isDestroyed = false;
let isLoading = $state(true);

async function loadLiveContent(proj: string, pTitle: string) {
    try {
        isLoading = true;
        const seedPromise = seedDemo();

        const client = await getYjsClientByProjectTitle(proj);
        if (isDestroyed) {
            client?.dispose();
            return;
        }
        if (!client) {
            logger.error(`Failed to connect to demo project`);
            return;
        }
        currentClient = client;

        const appProject = AppProject.fromDoc(client.getProject().ydoc);
        const updateContent = () => {
            const pageItem = findPageByName(appProject.items, pTitle);
            if (pageItem) {
                content = exportItemToMarkdown(pageItem);
            } else {
                content = "";
            }
        };

        // Initial update
        updateContent();

        // Subscribe to updates
        updateObserver = () => updateContent();
        appProject.ydoc.on('update', updateObserver);
        isLoading = false;

        const seedResult = await seedPromise;
        if (!isDestroyed && seedResult.ok && seedResult.reset) {
            logger.info("Demo reset detected, reconnecting client");
            appProject.ydoc.off('update', updateObserver);
            removeYjsClientByProjectId(proj);
            currentClient = null;
            await loadLiveContent(proj, pTitle);
            return;
        }

    } catch (e) {
        logger.error({ error: e instanceof Error ? e : new Error(String(e)) }, "Error loading live content");
    } finally {
        isLoading = false;
    }
}

onMount(() => {
    try {
        const params = $page.params as { page: string; };
        if (params) {
            pageTitle = params.page;

            // load live content
            loadLiveContent(project, pageTitle);

            logger.debug("Demo Diff page initialized:", { project, pageTitle });
        }
        else {
            logger.error("Page params not available");
        }
    }
    catch (error) {
        logger.error({ error: error instanceof Error ? error : new Error(String(error)) }, "Error initializing demo diff page:");
    }
});

onDestroy(() => {
    isDestroyed = true;
    try {
        if (currentClient && updateObserver) {
            const appProject = AppProject.fromDoc(currentClient.getProject().ydoc);
            appProject.ydoc.off('update', updateObserver);
        }
        removeYjsClientByProjectId(project);
    } catch (_e) {
        logger.error(_e);
    }
});
</script>

<svelte:head>
    <title>{pageTitle ? `History / Diff - ${pageTitle} - Demo | Outliner` : 'History / Diff | Outliner'}</title>
</svelte:head>

<main class="w-full max-w-7xl mx-auto px-4 py-8 md:px-8">
    <div class="mb-4">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: "Demo Project", href: "/demo" },
            ...(pageTitle ? [{ label: pageTitle, href: `/demo/${encodeURIComponent(pageTitle)}` }] : []),
            { label: "History" }
        ]} />
    </div>

    {#if isLoading}
        <div class="py-8">Loading Diff History...</div>
    {:else}
        <SnapshotDiffModal
            {project}
            page={pageTitle}
            bind:currentContent={content}
            author={user}
        />
    {/if}
</main>
