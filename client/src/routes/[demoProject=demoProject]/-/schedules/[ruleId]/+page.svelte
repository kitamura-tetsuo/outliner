<script lang="ts">
import { page } from "$app/stores";
import ScheduleDetailView from "../../../../../components/management/ScheduleDetailView.svelte";

let projectName = $derived($page.params.demoProject ?? "");
let ruleId = $derived($page.params.ruleId ?? "");
</script>

<ScheduleDetailView {projectName} {ruleId} />
