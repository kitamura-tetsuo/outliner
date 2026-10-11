<script lang="ts">
import { page } from "$app/stores";
import SqlCatalogListView from "../../../../components/management/SqlCatalogListView.svelte";

let projectName = $derived($page.params.project ?? "");
</script>

<SqlCatalogListView {projectName} />
