<script lang="ts">
import { page } from "$app/stores";
import ManagementLanding from "../../../components/management/ManagementLanding.svelte";

let projectName = $derived($page.params.demoProject ?? "");
</script>

<ManagementLanding {projectName} />
