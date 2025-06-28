<script lang="ts">
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
            console.error("Page params not available");
        }
    }
    catch (error) {
        console.error("Error initializing diff page:", error);
    }
});
</script>

<SnapshotDiffModal
    {project}
    page={pageTitle}
    bind:currentContent={content}
    author={user}
/>
