<script lang="ts">
import { page } from "$app/state";
import ScheduleDetailView from "../../../../../components/management/ScheduleDetailView.svelte";
import { isOnPrem } from "../../../../../lib/deployment";

let projectName = $derived(page.params.project ?? "");
let ruleId = $derived(page.params.ruleId ?? "");
</script>

{#if isOnPrem}
    <main class="container mx-auto px-4 py-8">
        <h1 class="text-3xl font-bold mb-4">Unavailable in this deployment</h1>
        <p>Schedule execution and publishing are not available in on-premises deployments.</p>
    </main>
{:else}
    <ScheduleDetailView {projectName} {ruleId} />
{/if}
