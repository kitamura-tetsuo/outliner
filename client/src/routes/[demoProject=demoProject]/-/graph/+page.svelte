<script lang="ts">
import { page } from "$app/stores";
import DemoProjectGate from "../../../../components/management/DemoProjectGate.svelte";
import GraphManagementView from "../../../../components/management/GraphManagementView.svelte";

let projectName = $derived($page.params.demoProject ?? "");
</script>

<DemoProjectGate {projectName}>
    <GraphManagementView {projectName} />
</DemoProjectGate>
