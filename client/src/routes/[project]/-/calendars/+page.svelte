<script lang="ts">
import { page } from "$app/stores";
import CalendarListView from "../../../../components/management/CalendarListView.svelte";

let projectName = $derived($page.params.project ?? "");
</script>

<CalendarListView {projectName} />
