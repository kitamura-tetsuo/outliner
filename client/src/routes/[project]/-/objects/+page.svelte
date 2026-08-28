<script lang="ts">
import { page } from "$app/stores";
import ObjectManagerView from "../../../../components/management/ObjectManagerView.svelte";

let projectName = $derived($page.params.project ?? "");
// `?selected=id1,id2` (issue #5153 §11): how an individual object's
// Duplicate action opens Object Manager with it preselected.
let preselectedIds = $derived(($page.url.searchParams.get("selected") ?? "").split(",").filter(Boolean));
</script>

<ObjectManagerView {projectName} {preselectedIds} />
