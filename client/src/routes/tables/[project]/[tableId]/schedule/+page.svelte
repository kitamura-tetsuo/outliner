<script lang="ts">
    // Legacy route. Schedules are project-level entities and are never owned by
    // a Table (issue #5012), so the canonical address is /schedules/<project>.
    // This page only forwards there; nothing about the old nesting survives in
    // the model.
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";

    let projectName = $derived($page.params.project);
    let canonicalHref = $derived(`/schedules/${encodeURIComponent(projectName)}`);

    onMount(() => {
        // replaceState: the nested URL is not a place a Back button should
        // return to, it no longer names anything.
        void goto(canonicalHref, { replaceState: true });
    });
</script>

<svelte:head>
    <title>Schedules | Outliner</title>
</svelte:head>

<main class="w-full max-w-7xl mx-auto px-4 py-8 md:px-8">
    <p class="text-sm text-gray-600" data-testid="table-schedule-redirect">
        Schedules belong to the project, not to a table.
        <a class="text-blue-600 hover:underline" href={canonicalHref}>Open this project's schedules</a>.
    </p>
</main>
