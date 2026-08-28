<script lang="ts">
import { page } from "$app/stores";
import CalendarDetailView from "../../../../../components/management/CalendarDetailView.svelte";

let projectName = $derived($page.params.project ?? "");
let calendarName = $derived($page.params.calendar ?? "");
</script>

<CalendarDetailView {projectName} {calendarName} />
