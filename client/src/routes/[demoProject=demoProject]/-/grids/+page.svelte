<script lang="ts">
import { page } from "$app/stores";
import GridListView from "../../../../components/management/GridListView.svelte";

let projectName = $derived($page.params.demoProject ?? "");
</script>

<GridListView {projectName} />
