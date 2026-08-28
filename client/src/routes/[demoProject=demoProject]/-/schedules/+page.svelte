<script lang="ts">
import { page } from "$app/stores";
import ScheduleListView from "../../../../components/management/ScheduleListView.svelte";

let projectName = $derived($page.params.demoProject ?? "");
</script>

<ScheduleListView {projectName} />
