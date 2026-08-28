<script lang="ts">
import { page } from "$app/stores";
import GridDetailView from "../../../../../components/management/GridDetailView.svelte";

let projectName = $derived($page.params.demoProject ?? "");
let gridId = $derived($page.params.gridId ?? "");
</script>

<GridDetailView {projectName} {gridId} />
