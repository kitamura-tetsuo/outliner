<script lang="ts">
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
import type { Item } from "../../../../schema/app-schema";

let project = $state("");
let pageTitle = $state("");
let pageId = $state("");
let schedules = $state<Schedule[]>([]);
let publishTime = $state("");
let editingId = $state("");
let editingTime = $state("");
let isDownloading = $state(false);

onMount(async () => {
    const params = $page.params as { project: string; page: string; };
    project = decodeURIComponent(params.project || "");
    pageTitle = decodeURIComponent(params.page || "");

    let sessionPinnedPageId: string | undefined;
    // 0) セッションに固定されたpageIdを候補として読み出す（ただし即returnせず、現在ページと一致するかを確認する）
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
    // セッションに保存されている pageId がある場合は最優先で採用する。
    // ただし、pageIdが現在のpageTitleに対応するページのものであるかを検証する
    if (sessionPinnedPageId) {
        // Validate that sessionPinnedPageId actually belongs to current pageTitle
        let isValid = false;
        try {
            const items = store.pages?.current;
            const len = items?.length ?? 0;
            for (let i = 0; i < len; i++) {
                const p = items?.at(i);
                if (!p) continue;
                if (String(p.id) === String(sessionPinnedPageId)) {
                    const title = p.text?.toString?.() ?? "";
                    if (title.toLowerCase() === pageTitle.toLowerCase()) {
                        isValid = true;
                        break;
                    }
                }
            }
        } catch {}
        if (isValid) {
            pageId = sessionPinnedPageId;
            console.log("Schedule page: Using validated session pinned pageId=", sessionPinnedPageId);
        } else {
            console.log("Schedule page: Session pinned pageId invalid for current page, will resolve fresh", {
                sessionPinnedPageId,
                pageTitle
            });
            sessionPinnedPageId = undefined; // Clear so we don't use stale value
        }
    }

    // store.currentPage が設定されるまで最大5秒待機
    let attempts = 0;
    while (!store.currentPage && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }

    // 1) 最優先: currentPage が現在のページを指している場合に使用（別ページの値が残っているケースを除外）
    try {
        const current = store.currentPage;
        const currentTitle = current?.text?.toString?.() ?? "";
        if (
            !pageId &&
            current &&
            currentTitle.toLowerCase() === pageTitle.toLowerCase()
        ) {
            pageId = String(store.currentPage?.id ?? "");
        }
    } catch {}

    // 2) currentPage が未確定の場合は URL の pageTitle から該当ページを特定
    if (!pageId) {
        try {
            const items = store.pages?.current;
            const len = items?.length ?? 0;
            let found: Item | undefined = undefined;
            for (let i = 0; i < len; i++) {
                const p = items?.at(i);
                if (!p) continue;
                const title = p.text.toString();
                if (title.toLowerCase() === pageTitle.toLowerCase()) {
                    found = p;
                    break;
                }
            }
            if (found) {
                pageId = found.id;
            }
        } catch {}
    }

    // 3) 最後の手段としてセッションの候補を使用（E2E安定化）
    if (!pageId && sessionPinnedPageId) {
        pageId = sessionPinnedPageId;
        console.log("Schedule page: Using session fallback pageId=", sessionPinnedPageId);
    }

    if (!pageId) {
        console.error("Schedule page: pageId is empty, cannot load schedules");
        return;
    }

    // 安定化: 解決したpageIdをセッションに保存し、リロード時に同一IDを再利用
    try {
        if (typeof window !== "undefined") {
            const key = `schedule:lastPageChildId:${encodeURIComponent(project)}:${encodeURIComponent(pageTitle)}`;
            // Only save if pageId was resolved from current page (not from stale session)
            // Validate that the resolved pageId actually belongs to the current pageTitle
            const isValidPageId = pageId && (() => {
                try {
                    const items = store.pages?.current;
                    const len = items?.length ?? 0;
                    for (let i = 0; i < len; i++) {
                        const p = items?.at(i);
                        if (!p) continue;
                        if (String(p.id) === String(pageId)) {
                            const title = p.text?.toString?.() ?? "";
                            return title.toLowerCase() === pageTitle.toLowerCase();
                        }
                    }
                } catch {}
                return false;
            })();
            if (isValidPageId) {
                window.sessionStorage?.setItem(key, String(pageId));
                console.log("Schedule page: Saved validated session pageId=", pageId);
            } else {
                console.log("Schedule page: Skipping session save - pageId not validated", { pageId, pageTitle });
            }
        }
    } catch {}

    await refresh();
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
