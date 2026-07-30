<script lang="ts">
    import { getLogger } from "$lib/logger";
    const logger = getLogger("Route");
import { page } from "$app/stores";
import { onMount, onDestroy } from "svelte";
import SnapshotDiffModal from "../../../../components/SnapshotDiffModal.svelte";
import Breadcrumb from "../../../../components/Breadcrumb.svelte";
import { exportItemToMarkdown, getYjsClientByProjectTitle, removeYjsClientByProjectId } from "../../../../services";
import { Project as AppProject } from "../../../../schema/app-schema";
import { findPageByName } from "../../../../utils/pageUtils";
import { userManager } from "../../../../auth/UserManager";

let project = $state("");
let pageTitle = $state("");
let content = $state("");
let user = $derived(userManager.getCurrentUser()?.name ?? "Guest");

import type { YjsClient } from "../../../../services/yjsService.svelte";
let currentClient: YjsClient | null = null;
let updateObserver: (() => void) | null = null;
let isDestroyed = false;

async function loadLiveContent(proj: string, pTitle: string) {
    try {
        const client = await getYjsClientByProjectTitle(proj);
        if (isDestroyed) {
            client?.dispose();
            return;
        }
        if (!client) {
            logger.error(`Failed to connect to project "${proj}"`);
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

    } catch (e) {
        logger.error({ error: e instanceof Error ? e : new Error(String(e)) }, "Error loading live content");
    }
}

onMount(() => {
    try {
        const params = $page.params as { project: string; page: string; };
        if (params) {
            project = params.project;
            pageTitle = params.page;

            // load live content
            loadLiveContent(project, pageTitle);

            logger.debug("Diff page initialized:", { project, pageTitle });
        }
        else {
            logger.error("Page params not available");
        }
    }
    catch (error) {
        logger.error({ error: error instanceof Error ? error : new Error(String(error)) }, "Error initializing diff page:");
    }
});

onDestroy(() => {
    isDestroyed = true;
    try {
        if (currentClient && updateObserver) {
            const appProject = AppProject.fromDoc(currentClient.getProject().ydoc);
            appProject.ydoc.off('update', updateObserver);
        }
        if (project) {
            removeYjsClientByProjectId(project);
        }
    } catch (_e) {
        logger.error(_e);
    }
});
</script>

<svelte:head>
    <title>{pageTitle && project ? `History / Diff - ${pageTitle} - ${project} | Outliner` : 'History / Diff | Outliner'}</title>
</svelte:head>

<main class="w-full max-w-7xl mx-auto px-4 py-8 md:px-8">
    <div class="mb-4">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            ...(project ? [{ label: project, href: `/${encodeURIComponent(project)}` }] : []),
            ...(pageTitle ? [{ label: pageTitle, href: `/${encodeURIComponent(project)}/${encodeURIComponent(pageTitle)}` }] : []),
            { label: "History" }
        ]} />
    </div>

    <SnapshotDiffModal
        {project}
        page={pageTitle}
        bind:currentContent={content}
        author={user}
    />
</main>