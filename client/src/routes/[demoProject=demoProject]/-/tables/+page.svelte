<script lang="ts">
import { page } from "$app/stores";
import TableListView from "../../../../components/management/TableListView.svelte";

let projectName = $derived($page.params.demoProject ?? "");
</script>

<TableListView {projectName} />
