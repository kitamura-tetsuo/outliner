<script lang="ts">
    import { getLogger } from "$lib/logger";
    const logger = getLogger("Route");
    import { page } from "$app/stores";
    import { onMount } from "svelte";
    import SnapshotDiffModal from "../../../../components/SnapshotDiffModal.svelte";
    import { getCurrentContent } from "../../../../services";
    import Breadcrumb from "../../../../components/Breadcrumb.svelte";

    let project = $state("");
    let pageTitle = $state("");
    let content = $state("");
    let user = "user";

    onMount(() => {
        try {
            const params = $page.params as { project: string; page: string; };
            if (params) {
                project = params.project;
                pageTitle = params.page;
                content = getCurrentContent(project, pageTitle);
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
</script>

<svelte:head>
    <title>{pageTitle ? `${pageTitle} - ${project === "demo" ? "Demo" : project} | Outliner` : "Outliner"}</title>
</svelte:head>

<main class="w-full max-w-7xl mx-auto px-4 py-8 md:px-8">
    <div class="mb-4">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            ...(project === "demo" ? [{ label: "Demo Project", href: "/demo" }] : project ? [{ label: project, href: `/${encodeURIComponent(project)}` }] : []),
            ...(pageTitle ? [{ label: pageTitle, href: project === "demo" ? `/demo/${encodeURIComponent(pageTitle)}` : `/${encodeURIComponent(project)}/${encodeURIComponent(pageTitle)}` }] : []),
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
