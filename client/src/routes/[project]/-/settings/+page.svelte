<script lang="ts">
import { page } from "$app/stores";
import ProjectSettingsView from "../../../../components/management/ProjectSettingsView.svelte";

let projectName = $derived($page.params.project ?? "");
</script>

<ProjectSettingsView {projectName} />
