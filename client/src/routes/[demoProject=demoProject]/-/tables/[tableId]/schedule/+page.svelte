<script lang="ts">
// Legacy redirect: a Schedule is a project entity, not Table-nested
// (issue #5012). This kept the old `/tables/<project>/<tableId>/schedule`
// path working after that move; it now redirects into the unified
// project-management namespace instead.
import { page } from "$app/state";
import { goto } from "$app/navigation";
import { projectSchedulesRoute } from "../../../../../../lib/managementPaths";
import { onMount } from "svelte";

let projectName = $derived(page.params.demoProject ?? "");

onMount(() => {
    goto(projectSchedulesRoute(projectName), { replace: true });
});
</script>
