<script lang="ts">
import { page } from "$app/state";
import GraphManagementView from "../../../../components/management/GraphManagementView.svelte";

let projectName = $derived(page.params.project ?? "");
</script>

<GraphManagementView {projectName} />
