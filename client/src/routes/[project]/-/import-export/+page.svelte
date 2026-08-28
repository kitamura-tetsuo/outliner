<script lang="ts">
import { page } from "$app/stores";
import ImportExportView from "../../../../components/management/ImportExportView.svelte";

let projectName = $derived($page.params.project ?? "");
</script>

<ImportExportView {projectName} />
