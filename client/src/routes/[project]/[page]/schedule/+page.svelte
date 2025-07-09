<script lang="ts">
import { goto } from "$app/navigation";
import { page } from "$app/stores";
import { onMount } from "svelte";
import {
    cancelSchedule,
    createSchedule,
    listSchedules,
    type Schedule,
    updateSchedule,
} from "../../../../services";
import { store } from "../../../../stores/store.svelte";

let project = $state("");
let pageTitle = $state("");
let pageId = $state("");
let schedules = $state<Schedule[]>([]);
let publishTime = $state("");
let editingId = $state("");
let editingTime = $state("");

onMount(async () => {
    const params = $page.params as { project: string; page: string; };
    project = decodeURIComponent(params.project || "");
    pageTitle = decodeURIComponent(params.page || "");

    // store.currentPageが設定されるまで待つ
    let attempts = 0;
    while (!store.currentPage && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    // URLパラメータから正しいページを取得（store.currentPageは信頼しない）
    const foundPage = store.pages?.current?.find(p => p.text === pageTitle);
    pageId = foundPage?.id || "";
    console.log("Schedule page: pageId =", pageId, "currentPage =", store.currentPage);
    console.log("Schedule page: URL params - project:", project, "pageTitle:", pageTitle);
    console.log("Schedule page: foundPage from URL:", foundPage?.text, "id:", foundPage?.id);
    console.log("Schedule page: store.pages count:", store.pages?.current?.length);
    console.log("Schedule page: available pages:", store.pages?.current?.map(p => p.text));
    console.log("Schedule page: current project title:", store.project?.title);

    // プロジェクトが一致しない場合は待機
    if (store.project?.title !== project) {
        console.log("Schedule page: Project mismatch, waiting for correct project to load");
        pageId = "";
    }

    if (pageId) {
        await refresh();
    }
    else {
        console.error("Schedule page: pageId is empty, cannot load schedules");
    }
});

async function refresh() {
    if (!pageId) {
        console.error("Schedule page: Cannot refresh, pageId is empty");
        return;
    }
    console.log("Schedule page: Refreshing schedules for pageId:", pageId);
    try {
        schedules = await listSchedules(pageId);
        console.log("Schedule page: Loaded schedules:", schedules);
    }
    catch (err) {
        console.error("Schedule page: Error loading schedules:", err);
    }
}

async function addSchedule() {
    if (!publishTime) {
        console.error("Schedule page: Cannot add schedule, publishTime is empty");
        return;
    }
    if (!pageId) {
        console.error("Schedule page: Cannot add schedule, pageId is empty");
        return;
    }
    console.log("Schedule page: Adding schedule for pageId:", pageId, "publishTime:", publishTime);
    try {
        const ts = new Date(publishTime).getTime();
        const result = await createSchedule(pageId, { strategy: "one_shot", nextRunAt: ts });
        console.log("Schedule page: Schedule created successfully:", result);
        publishTime = "";
        await refresh();
    }
    catch (err) {
        console.error("Schedule page: Error creating schedule:", err);
    }
}

async function cancel(id: string) {
    console.log("Schedule page: Canceling schedule:", id);
    try {
        await cancelSchedule(pageId, id);
        console.log("Schedule page: Schedule canceled successfully");
        await refresh();
    }
    catch (err) {
        console.error("Schedule page: Error canceling schedule:", err);
    }
}

function startEdit(sch: Schedule) {
    editingId = sch.id;
    editingTime = new Date(sch.nextRunAt).toISOString().slice(0, 16);
}

async function saveEdit() {
    if (!editingId || !editingTime) {
        console.error("Schedule page: Missing editing values");
        return;
    }
    const ts = new Date(editingTime).getTime();
    try {
        await updateSchedule(pageId, editingId, {
            strategy: "one_shot",
            nextRunAt: ts,
        });
        editingId = "";
        editingTime = "";
        await refresh();
    }
    catch (err) {
        console.error("Schedule page: Error updating schedule:", err);
    }
}

function back() {
    goto(`/${project}/${pageTitle}`);
}
</script>

<div class="p-4">
    <h1 class="text-xl font-bold mb-4">Schedule Management</h1>
    <div class="mb-4">
        <label for="publish-time" class="mr-2">Publish Time:</label>
        <input id="publish-time" type="datetime-local" bind:value={publishTime} class="border p-1" />
        <button onclick={addSchedule} class="ml-2 px-2 py-1 bg-blue-600 text-white rounded">Add</button>
        <button onclick={back} class="ml-2 px-2 py-1 bg-gray-300 rounded">Back</button>
    </div>
    <ul data-testid="schedule-list">
        {#each schedules as sch}
            <li class="mb-2" data-testid="schedule-item">
                {#if editingId === sch.id}
                    <input type="datetime-local" bind:value={editingTime} class="border p-1" />
                    <button onclick={saveEdit} class="ml-2 px-2 py-1 bg-green-600 text-white rounded">Save</button>
                {:else}
                    {new Date(sch.nextRunAt).toLocaleString()}
                    <button onclick={() => startEdit(sch)} class="ml-2 px-2 py-1 bg-yellow-500 text-white rounded">
                        Edit
                    </button>
                    <button onclick={() => cancel(sch.id)} class="ml-2 px-2 py-1 bg-red-500 text-white rounded">
                        Cancel
                    </button>
                {/if}
            </li>
        {/each}
    </ul>
</div>
