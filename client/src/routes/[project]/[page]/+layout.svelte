<script lang="ts">
import { onMount } from "svelte";
import { store } from "../../../stores/store.svelte";

// The `currentPage` setting has been consolidated into `+page.svelte`.
// This layout does not have that responsibility and only renders child content.
// However, it includes initialization logic to ensure project data is loaded
// even when accessed directly from child routes like `schedule`.
let { children } = $props();

onMount(async () => {
    // E2E stability: If store.project is still the provisional project (empty),
    // and we're on a child route like /schedule, trigger the project loading
    // The main page's +page.svelte might not be mounted for child routes
    if (typeof window !== "undefined") {
        const win = window as any;
        // Check if this is a child route (not the main page)
        const path = win.location?.pathname ?? "";
        const isChildRoute = path.includes("/schedule") || path.includes("/graph");

        if (isChildRoute && (!store.project?.items?.length || store.project?.items?.length === 0)) {
            console.log("[+layout.svelte] Child route detected with empty project, checking loadProjectAndPage availability");

            // If loadProjectAndPage is available, trigger it
            if (win.loadProjectAndPage) {
                console.log("[+layout.svelte] Triggering loadProjectAndPage for child route");
                const loadInProgressKey = "__loadingInProgress";
                if (!win[loadInProgressKey]) {
                    win[loadInProgressKey] = true;
                    try {
                        await win.loadProjectAndPage();
                    } finally {
                        win[loadInProgressKey] = false;
                    }
                }
            } else {
                console.log("[+layout.svelte] loadProjectAndPage not available yet, project might be provisional");
            }
        }
    }
});
</script>

{@render children()}
