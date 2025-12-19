<script lang="ts">
import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { resolve } from "$app/paths";
import { page } from "$app/stores";
import { onMount } from "svelte";
import {
    cancelSchedule,
    createSchedule,
    exportSchedulesIcal,
    listSchedules,
    type Schedule,
    updateSchedule,
} from "../../../../services";
import { store } from "../../../../stores/store.svelte";

let project = $state("");
let pageTitle = $state("");
let pageId = $state("");
let schedules = $state<Schedule[]>([]);
let loading = $state(false); // eslint-disable-line @typescript-eslint/no-unused-vars
let publishTime = $state("");
let editingId = $state("");
let editingTime = $state("");
let isDownloading = $state(false);

onMount(async () => {
    const params = $page.params as { project: string; page: string; };
    project = decodeURIComponent(params.project || "");
    pageTitle = decodeURIComponent(params.page || "");

    console.log("Schedule page: onMount started for project=", project, "pageTitle=", pageTitle);

    // 0) セッションに固定されたpageIdを候補として読み出す
    let sessionPinnedPageId: string | undefined;
    try {
        if (typeof window !== "undefined") {
            const key = `schedule:lastPageChildId:${encodeURIComponent(project)}:${encodeURIComponent(pageTitle)}`;
            const saved = window.sessionStorage?.getItem(key) || "";
            if (saved) {
                sessionPinnedPageId = String(saved);
                console.log("Schedule page: Found session pinned pageId=", sessionPinnedPageId);
            }
        }
    } catch {}

    // store.currentPage が設定され、かつページタイトルが一致するまで最大8秒待機
    // リロード直後は store.currentPage が古いページのままだったり null だったりするため
    let attempts = 0;
    while (attempts < 80) {
        try {
            const current = store.currentPage;
            const currentTitle = current?.text?.toString?.() ?? "";
            if (current && currentTitle.toLowerCase() === pageTitle.toLowerCase()) {
                pageId = String(current.id ?? "");
                console.log("Schedule page: store.currentPage matched!", { title: currentTitle, id: pageId });
                break;
            }
        } catch {}
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    // 1) currentPage で解決できない場合は store.pages から検索
    if (!pageId) {
        try {
            const items = store.pages?.current;
            const itemsArray = items ? Array.from(items) : [];
            console.log("Schedule page: Searching in store.pages.count=", itemsArray.length);
            for (const p of itemsArray) {
                const title = (p as any)?.text?.toString?.() ?? "";
                if (title.toLowerCase() === pageTitle.toLowerCase()) {
                    pageId = (p as any).id;
                    console.log("Schedule page: Found in store.pages. id=", pageId);
                    break;
                }
            }
        } catch (e) {
            console.warn("Schedule page: Error searching in store.pages", e);
        }
    }

    // 2) 最後の手段としてセッションの候補を使用（E2E安定化）
    if (!pageId && sessionPinnedPageId) {
        pageId = sessionPinnedPageId;
        console.log("Schedule page: Using session fallback pageId=", sessionPinnedPageId);
    }

    // Safety check for ID switching
    if (pageId && sessionPinnedPageId && String(pageId) !== String(sessionPinnedPageId)) {
        console.warn("Schedule page: Page ID Switching detected!", {
            foundId: pageId,
            sessionPinnedId: sessionPinnedPageId,
            pageTitle
        });
        // We favor the one found in the current store/project over the old session one
    }


    if (!pageId) {
        console.error("Schedule page: pageId is empty, cannot load schedules. Attempts=", attempts, "pageTitle=", pageTitle);
        // Debug: Log all available pages
        try {
            const items = store.pages?.current;
            const itemsArray = items ? Array.from(items) : [];
            console.log("Schedule page: Available pages:", itemsArray.map((p: any) => ({
                title: p?.text?.toString?.() ?? "",
                id: p?.id
            })));
        } catch {}
        return;
    }


    // 安定化: 解決したpageIdをセッションに保存
    try {
        if (typeof window !== "undefined") {
            const key = `schedule:lastPageChildId:${encodeURIComponent(project)}:${encodeURIComponent(pageTitle)}`;
            window.sessionStorage?.setItem(key, String(pageId));
            console.log("Schedule page: Saved session pageId=", pageId);
        }
    } catch {}

    // Wait for auth to be ready if in test environment
    if (typeof window !== "undefined") {
        for (let i = 0; i < 50; i++) {
            if ((window as any).__USER_MANAGER__?.getCurrentUser()) break;
            await new Promise(r => setTimeout(r, 200));
        }
    }

    console.log("Schedule page: starting initial refresh");
    // $effect handles the initial refresh and any subsequent pageId changes
});

$effect(() => {
    if (pageId && browser) {
        console.log("Schedule page: pageId is set, triggering refresh. id=", pageId);
        refresh();
    }
});

async function refresh() {
    if (!pageId) {
        console.warn("Schedule page: refresh aborted because pageId is missing");
        return;
    }
    loading = true;
    try {
        console.log("Schedule page: calling listSchedules for id=", pageId);
        const list = await listSchedules(pageId); // Changed from scheduleService.listSchedules to listSchedules
        schedules = list;
        console.log("Schedule page: listSchedules returned count=", schedules.length, "for id=", pageId);
    } catch (e) {
        console.error("Schedule page: listSchedules failed", e);
    } finally {
        loading = false;
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
    editingTime = toLocalISOString(sch.nextRunAt);
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

async function back() {
    await goto(resolve(`/${project}/${pageTitle}`));
}

async function downloadIcs() {
    if (!pageId) {
        console.error("Schedule page: Cannot export schedules, pageId is empty");
        return;
    }
    try {
        isDownloading = true;
        const { blob, filename } = await exportSchedulesIcal(pageId);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        console.log("Schedule page: Exported schedules to iCal", filename);
    }
    catch (err) {
        console.error("Schedule page: Error exporting schedules:", err);
    }
    finally {
        isDownloading = false;
    }
}

function formatDate(timestamp: number): string {
    const d = new Date(timestamp);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function toLocalISOString(timestamp: number): string {
    const d = new Date(timestamp);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}
</script>

<div class="p-4">
    <h1 class="text-xl font-bold mb-4">Schedule Management</h1>
    <div class="mb-4">
        <label for="publish-time" class="mr-2">Publish Time:</label>
        <input id="publish-time" type="datetime-local" bind:value={publishTime} class="border p-1" />
        <button onclick={addSchedule} class="ml-2 px-2 py-1 bg-blue-600 text-white rounded">Add</button>
        <button onclick={back} class="ml-2 px-2 py-1 bg-gray-300 rounded">Back</button>
        <button
            onclick={downloadIcs}
            class="ml-2 px-2 py-1 bg-green-700 text-white rounded disabled:opacity-60"
            disabled={isDownloading}
            data-testid="download-ics"
        >
            {isDownloading ? "Preparing…" : "Download iCal"}
        </button>
    </div>
    <div data-testid="schedule-debug" class="text-xs text-gray-500 mb-2">
        ScheduleDebug:{pageId}:{schedules.length}
    </div>
    <ul data-testid="schedule-list">
        {#each schedules as sch (sch.id)}
            <li class="mb-2" data-testid="schedule-item">
                {#if editingId === sch.id}
                    <input type="datetime-local" bind:value={editingTime} class="border p-1" />
                    <button onclick={saveEdit} class="ml-2 px-2 py-1 bg-green-600 text-white rounded">Save</button>
                {:else}
                    {formatDate(sch.nextRunAt)}
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

<style>
</style>
