<script lang="ts">
import { page } from "$app/state";
import ScheduleListView from "../../../../components/management/ScheduleListView.svelte";

let projectName = $derived(page.params.project ?? "");
</script>

<ScheduleListView {projectName} />
