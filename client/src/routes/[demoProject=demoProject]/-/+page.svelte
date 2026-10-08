<script lang="ts">
import { page } from "$app/state";
import ManagementLanding from "../../../components/management/ManagementLanding.svelte";

let projectName = $derived(page.params.demoProject ?? "");
</script>

<ManagementLanding {projectName} />
