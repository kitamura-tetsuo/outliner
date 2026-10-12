<script lang="ts">
import { page } from "$app/state";
import TypeListView from "../../../../components/management/TypeListView.svelte";

let projectName = $derived(page.params.project ?? "");
</script>

<TypeListView {projectName} />
