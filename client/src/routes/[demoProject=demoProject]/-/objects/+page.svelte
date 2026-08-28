<script lang="ts">
import { page } from "$app/stores";
import DemoProjectGate from "../../../../components/management/DemoProjectGate.svelte";
import ObjectManagerView from "../../../../components/management/ObjectManagerView.svelte";

let projectName = $derived($page.params.demoProject ?? "");
let preselectedIds = $derived(($page.url.searchParams.get("selected") ?? "").split(",").filter(Boolean));
</script>

<DemoProjectGate {projectName}>
    <ObjectManagerView {projectName} {preselectedIds} />
</DemoProjectGate>
