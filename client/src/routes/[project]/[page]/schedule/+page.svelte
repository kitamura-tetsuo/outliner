<script lang="ts">
import { page } from "$app/stores";
import { onMount } from "svelte";
import { goto } from "$app/navigation";
import { store } from "../../../../stores/store.svelte";
import {
    createSchedule,
    listSchedules,
    cancelSchedule,
    type Schedule,
} from "../../../../services";

let project = $state("");
let pageTitle = $state("");
let pageId = $state("");
let schedules = $state<Schedule[]>([]);
let publishTime = $state("");

onMount(() => {
    const params = $page.params as { project: string; page: string };
    project = decodeURIComponent(params.project || "");
    pageTitle = decodeURIComponent(params.page || "");
    pageId = store.currentPage?.id || "";
    refresh();
});

async function refresh() {
    if (!pageId) return;
    try {
        schedules = await listSchedules(pageId);
    } catch (err) {
        console.error(err);
    }
}

async function addSchedule() {
    if (!publishTime) return;
    const ts = new Date(publishTime).getTime();
    await createSchedule(pageId, { strategy: "one_shot", nextRunAt: ts });
    publishTime = "";
    await refresh();
}

async function cancel(id: string) {
    await cancelSchedule(pageId, id);
    await refresh();
}

function back() {
    goto(`/${project}/${pageTitle}`);
}
</script>

<div class="p-4">
    <h1 class="text-xl font-bold mb-4">Schedule Management</h1>
    <div class="mb-4">
        <label class="mr-2">Publish Time:</label>
        <input type="datetime-local" bind:value={publishTime} class="border p-1" />
        <button on:click={addSchedule} class="ml-2 px-2 py-1 bg-blue-600 text-white rounded">Add</button>
        <button on:click={back} class="ml-2 px-2 py-1 bg-gray-300 rounded">Back</button>
    </div>
    <ul>
        {#each schedules as sch}
            <li class="mb-2">
                {new Date(sch.nextRunAt).toLocaleString()}
                <button on:click={() => cancel(sch.id)} class="ml-2 px-2 py-1 bg-red-500 text-white rounded">Cancel</button>
            </li>
        {/each}
    </ul>
</div>
