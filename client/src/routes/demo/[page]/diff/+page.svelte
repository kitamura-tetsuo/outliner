<script lang="ts">
    import { getLogger } from "$lib/logger";
    const logger = getLogger("Route");
import { page } from "$app/stores";
import { onMount, onDestroy } from "svelte";
import SnapshotDiffModal from "../../../../components/SnapshotDiffModal.svelte";
import Breadcrumb from "../../../../components/Breadcrumb.svelte";
import { exportItemToMarkdown } from "../../../../services";
import { DEMO_PROJECT_NAME } from "../../../../lib/demoSeed";
import { DemoInitAborted, initializeDemoProject, releaseDemoProject } from "../../../../lib/demoInit";
import type { DemoProjectHandle } from "../../../../lib/demoInit";
import { findPageByName } from "../../../../utils/pageUtils";
import { userManager } from "../../../../auth/UserManager";

let project = $state(DEMO_PROJECT_NAME);
let pageTitle = $state("");
let content = $state("");
let user = $derived(userManager.getCurrentUser()?.name ?? "Guest");

let boundHandle: DemoProjectHandle | undefined = undefined;
let updateObserver: (() => void) | null = null;
let isDestroyed = false;
let isLoading = $state(true);

function unbind() {
    if (boundHandle && updateObserver) {
        boundHandle.project.ydoc.off("update", updateObserver);
    }
    boundHandle = undefined;
    updateObserver = null;
}

// Mirror the live document into `content`. Re-bound from scratch whenever the
// workflow hands us a different Y.Doc (a reset replaces the document).
function bind(handle: DemoProjectHandle, pTitle: string) {
    unbind();
    boundHandle = handle;

    const updateContent = () => {
        const pageItem = findPageByName(handle.project.items, pTitle);
        content = pageItem ? exportItemToMarkdown(pageItem) : "";
    };

    updateContent();
    updateObserver = () => updateContent();
    handle.project.ydoc.on("update", updateObserver);
}

async function loadLiveContent(proj: string, pTitle: string) {
    try {
        isLoading = true;
        // Connects immediately; template freshness is validated in parallel and
        // only reported back when the server actually rebuilt the document.
        const handle = await initializeDemoProject({
            isDestroyed: () => isDestroyed,
            onValidated: (update) => {
                if (update.reset && update.handle) {
                    // The document was rebuilt: re-bind to the fresh one.
                    bind(update.handle, pTitle);
                } else if (update.seedFailure) {
                    logger.error("Failed to seed demo");
                }
            },
        });
        bind(handle, pTitle);
    } catch (e) {
        if (e instanceof DemoInitAborted) return;
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
        unbind();
        releaseDemoProject();
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
