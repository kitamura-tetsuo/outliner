<script lang="ts">
    import { getLogger } from "$lib/logger";
    const logger = getLogger("Route");
import { page } from "$app/stores";
import { onMount } from "svelte";
import SnapshotDiffModal from "../../../../components/SnapshotDiffModal.svelte";
import { getCurrentContent } from "../../../../services";

let project = $state("");
let pageTitle = $state("");
let content = $state("");
let user = "user";

onMount(() => {
    try {
        const params = $page.params as { project: string; page: string; };
        if (params) {
            project = decodeURIComponent(params.project || "");
            pageTitle = decodeURIComponent(params.page || "");
            content = getCurrentContent(project, pageTitle);
            console.log("Diff page initialized:", { project, pageTitle, content });
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

<SnapshotDiffModal
    {project}
    page={pageTitle}
    bind:currentContent={content}
    author={user}
/>
