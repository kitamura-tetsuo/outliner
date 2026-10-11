<script lang="ts">
import { page } from "$app/state";
import ScheduleListView from "../../../../components/management/ScheduleListView.svelte";

let projectName = $derived(page.params.demoProject ?? "");
</script>

<ScheduleListView {projectName} />
