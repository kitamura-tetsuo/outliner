<script lang="ts">
import { page } from "$app/stores";
import SqlCatalogView from "../../../../components/management/SqlCatalogView.svelte";

let projectName = $derived($page.params.project ?? "");
</script>

<SqlCatalogView {projectName} />
