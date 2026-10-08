<script lang="ts">
import { page } from "$app/state";
import ProjectSettingsView from "../../../../components/management/ProjectSettingsView.svelte";

let projectName = $derived(page.params.project ?? "");
</script>

<ProjectSettingsView {projectName} />
