<script lang="ts">
import { page } from "$app/state";
import ImportExportView from "../../../../components/management/ImportExportView.svelte";

let projectName = $derived(page.params.project ?? "");
</script>

<ImportExportView {projectName} />
