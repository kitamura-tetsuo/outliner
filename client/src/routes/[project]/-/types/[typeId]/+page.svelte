<script lang="ts">
import { page } from "$app/stores";
import SqlCatalogDetailView from "../../../../../components/management/SqlCatalogDetailView.svelte";

let projectName = $derived($page.params.project ?? "");
let catalogId = $derived($page.params.typeId ?? "");
</script>

<SqlCatalogDetailView {projectName} {catalogId} />
