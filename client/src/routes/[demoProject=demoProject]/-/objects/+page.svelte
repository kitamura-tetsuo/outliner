<script lang="ts">
import { page } from "$app/stores";
import DemoProjectGate from "../../../../components/management/DemoProjectGate.svelte";
import ObjectManagerView from "../../../../components/management/ObjectManagerView.svelte";

let projectName = $derived($page.params.demoProject ?? "");
</script>

<DemoProjectGate {projectName}>
    <ObjectManagerView {projectName} />
</DemoProjectGate>
