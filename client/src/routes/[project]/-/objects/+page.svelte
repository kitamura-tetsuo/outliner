<script lang="ts">
import { page } from "$app/stores";
import ObjectManagerView from "../../../../components/management/ObjectManagerView.svelte";

let projectName = $derived($page.params.project ?? "");
</script>

<ObjectManagerView {projectName} />
