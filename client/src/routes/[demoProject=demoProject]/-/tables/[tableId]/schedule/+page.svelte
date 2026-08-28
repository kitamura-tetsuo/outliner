<script lang="ts">
// Legacy redirect: a Schedule is a project entity, not Table-nested
// (issue #5012). This kept the old `/tables/<project>/<tableId>/schedule`
// path working after that move; it now redirects into the unified
// project-management namespace instead.
import { page } from "$app/stores";
import { goto } from "$app/navigation";
import { resolvePath } from "../../../../../../utils/pathUtils";
import { projectSchedulesPath } from "../../../../../../lib/managementPaths";
import { onMount } from "svelte";

let projectName = $derived($page.params.demoProject ?? "");

onMount(() => {
    goto(resolvePath(projectSchedulesPath(projectName)), { replaceState: true });
});
</script>
