<script lang="ts">
import { page } from "$app/state";
import GridListView from "../../../../components/management/GridListView.svelte";

let projectName = $derived(page.params.project ?? "");
</script>

<GridListView {projectName} />
