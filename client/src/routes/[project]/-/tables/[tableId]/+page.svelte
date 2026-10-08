<script lang="ts">
import { page } from "$app/state";
import TableDetailView from "../../../../../components/management/TableDetailView.svelte";

let projectName = $derived(page.params.project ?? "");
let tableId = $derived(page.params.tableId ?? "");
</script>

<TableDetailView {projectName} {tableId} />
