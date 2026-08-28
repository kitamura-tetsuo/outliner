<script lang="ts">
import { page } from "$app/stores";
import GraphManagementView from "../../../../components/management/GraphManagementView.svelte";

let projectName = $derived($page.params.project ?? "");
</script>

<GraphManagementView {projectName} />
