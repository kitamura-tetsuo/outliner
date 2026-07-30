<script lang="ts">
    import { getLogger } from "$lib/logger";
    const logger = getLogger("Route");
    import { page } from "$app/stores";
    import { onMount, onDestroy } from "svelte";
    import SnapshotDiffModal from "../../../../components/SnapshotDiffModal.svelte";
    import Breadcrumb from "../../../../components/Breadcrumb.svelte";
    import { getYjsClientByProjectTitle, exportItemToMarkdown, importMarkdownIntoItem } from "../../../../services";
    import { findPageByName } from "../../../../utils/pageUtils";
    import { Project as AppProject } from "../../../../schema/app-schema";

    let project = $state("");
    let pageTitle = $state("");
    let content = $state("");
    let user = "user"; // Hardcoded default, as previously

    // Store variables
    let currentProject: AppProject | undefined;

    let observer: (() => void) | undefined;
    let isInternalUpdate = false;

    function handleRevert(newContent: string) {
        logger.debug("handleRevert called with:", newContent);
        if (currentProject) {
            const pageItem = findPageByName(currentProject.items, pageTitle);
            if (pageItem) {
                isInternalUpdate = true;
                currentProject.ydoc.transact(() => {
                    importMarkdownIntoItem(newContent, pageItem);
                });
                isInternalUpdate = false;
            }
        }
    }

    function updateContent() {
        if (isInternalUpdate) return;
        if (currentProject) {
            const pageItem = findPageByName(currentProject.items, pageTitle);
            if (pageItem) {
                content = exportItemToMarkdown(pageItem);
                logger.debug("Content updated from live Yjs page");
            } else {
                content = "";
            }
        }
    }

    onMount(async () => {
        try {
            const params = $page.params as { project: string; page: string; };
            if (params) {
                project = params.project;
                pageTitle = params.page;

                // Get the Yjs client
                const client = await getYjsClientByProjectTitle(project);
                if (client) {
                    currentProject = AppProject.fromDoc(client.getProject().ydoc);

                    updateContent();

                    // Bind to Yjs observeDeep
                    const ymap = currentProject.ydoc.getMap("orderedTree");
                    observer = () => {
                        updateContent();
                    };
                    ymap.observeDeep(observer);
                } else {
                     logger.error("Could not get Yjs client for project:", project);
                }

                logger.debug("Diff page initialized:", { project, pageTitle, content });
            }
            else {
                logger.error("Page params not available");
            }
        }
        catch (error) {
            logger.error({ error: error }, "Error initializing diff page:");
        }
    });

    onDestroy(() => {
        if (currentProject && observer) {
            const ymap = currentProject.ydoc.getMap("orderedTree");
            ymap.unobserveDeep(observer);
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
        onRevert={handleRevert}
        {project}
        page={pageTitle}
        bind:currentContent={content}
        author={user}
    />
</main>
