<script lang="ts">
import { page } from "$app/stores";
import TableDetailView from "../../../../../components/management/TableDetailView.svelte";

let projectName = $derived($page.params.demoProject ?? "");
let tableId = $derived($page.params.tableId ?? "");
</script>

<TableDetailView {projectName} {tableId} />
