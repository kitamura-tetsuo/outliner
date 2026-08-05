<script lang="ts">
    import { getLogger } from "$lib/logger";
    const logger = getLogger("Route");
import { resolvePath } from "../../../../utils/pathUtils";
import { formatDateTime } from "../../../../utils/dateUtils";


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
let publishTime = $state("");
let editingId = $state("");
let editingTime = $state("");
let isDownloading = $state(false);
let loadError = $state<string | null>(null);

// Track navigation state for debugging
let navState = $state({
    onMountCount: 0,
    needsNavigation: false,
    navigationDone: false,
    pageIdResolved: false,
});

onMount(() => {
    let destroyed = false;

    const init = async () => {
    navState.onMountCount++;
    logger.debug("Schedule page: onMount started", {
        count: navState.onMountCount,
        project,
        pageTitle,
        storeProjectItems: store.project?.items?.length ?? 0,
    });

    const params = $page.params as { project: string; page: string; };
    project = params.project;
    pageTitle = params.page;

    // E2E stability: Check if project data is already loaded
    // IMPORTANT: Also check if the loaded project has the correct title (handles store reset during navigation)
    const currentProjectTitle = store.project?.title ?? "";
    const isCorrectProject = currentProjectTitle === project;
    const hasProjectData = (store.project?.items?.length ?? 0) > 0 && isCorrectProject;

    // Check if we have a saved pageId in session storage
    const sessionKey = `schedule:lastPageChildId:${encodeURIComponent(project)}:${encodeURIComponent(pageTitle)}`;
    const savedPageId = typeof window !== "undefined" ? window.sessionStorage?.getItem(sessionKey) : null;

    logger.debug("Schedule page: Initial check", {
        hasProjectData,
        itemsLength: store.project?.items?.length ?? 0,
        isCorrectProject,
        currentProjectTitle,
        expectedProject: project,
        hasSavedPageId: !!savedPageId,
        savedPageId: savedPageId ?? "null"
    });

    // Load the project and page directly using the reusable loader service
    // This avoids bouncing to the parent page and waiting for E2E-only globals
    if (!hasProjectData || !savedPageId) {
        logger.debug("Schedule page: Project data not loaded or no saved pageId, directly loading");
        try {
            const { loadProjectAndPage } = await import("../../../../lib/projectPageLoader");
            const result = await loadProjectAndPage(project, pageTitle);

            // Set pageId from the loaded page directly
            pageId = String(result.page.id ?? "");
            logger.debug("Schedule page: Successfully loaded project/page directly, pageId=", pageId);
        } catch (e) {
            logger.error({ error: e }, "Schedule page: Error loading project and page");
            loadError = e instanceof Error ? e.message : String(e);
            return;
        }
    } else {
        logger.debug("Schedule page: Using saved pageId from session", savedPageId);
        pageId = savedPageId;
    }

    if (!pageId) {
        logger.error("Schedule page: pageId is empty, cannot load schedules");
        return;
    }

    // Save pageId to session storage for stability across reloads
    try {
        if (typeof window !== "undefined" && pageId) {
            const key = `schedule:lastPageChildId:${encodeURIComponent(project)}:${encodeURIComponent(pageTitle)}`;
            window.sessionStorage?.setItem(key, String(pageId));
            logger.debug("Schedule page: Saved pageId to sessionStorage:", pageId);
        }
    } catch (_e) { logger.error(_e); }

    logger.debug("Schedule page: Final pageId before refresh:", pageId);
    if (pageId) {
        await refresh();
    }

    // E2E stability: Export refresh function to window for test access
    // This helper is kept as tests explicitly rely on it rather than full page reloads
    if (typeof window !== "undefined" && import.meta.env.MODE === "test") {
        (window as unknown as { refreshSchedules?: (pid?: string) => Promise<void> }).refreshSchedules = async (pid?: string) => {
            logger.debug("Schedule page: E2E refreshSchedules called with pid=", pid);
            if (pid) {
                pageId = pid;
            }
            if (!destroyed) await refresh();
        };
    }
    };

    init();

    return () => {
        destroyed = true;
    };
});

// E2E stability: Re-call refresh when pageId changes (handles race conditions during navigation)
$effect(() => {
    if (pageId) {
        logger.debug("Schedule page: $effect triggered with pageId:", pageId, "schedules.length:", schedules.length);
        // Small delay to ensure DOM is ready
        const timer = setTimeout(() => {
            refresh();
        }, 100);
        return () => clearTimeout(timer);
    }
});

async function refresh() {
    if (!pageId) {
        logger.error("Schedule page: Cannot refresh, pageId is empty");
        return;
    }
    logger.debug("Schedule page: Refreshing schedules for pageId:", pageId);
    try {
        loadError = null;
        schedules = await listSchedules(pageId);
        logger.debug("Schedule page: Loaded schedules:", schedules);
    }
    catch (err) {
        logger.error({ error: err }, "Schedule page: Error loading schedules:");
        loadError = err instanceof Error ? err.message : String(err);
    }
}

async function addSchedule() {
    if (!publishTime) {
        logger.error("Schedule page: Cannot add schedule, publishTime is empty");
        return;
    }
    if (!pageId) {
        logger.error("Schedule page: Cannot add schedule, pageId is empty");
        return;
    }
    logger.debug("Schedule page: Adding schedule for pageId:", pageId, "publishTime:", publishTime);
    try {
        const ts = new Date(publishTime).getTime();
        const result = await createSchedule(pageId, { strategy: "one_shot", nextRunAt: ts });
        logger.debug("Schedule page: Schedule created successfully:", result);
        publishTime = "";
        await refresh();
    }
    catch (err) {
        logger.error({ error: err }, "Schedule page: Error creating schedule:");
    }
}

async function cancel(id: string) {
    logger.debug("Schedule page: Canceling schedule:", id);
    try {
        await cancelSchedule(pageId, id);
        logger.debug("Schedule page: Schedule canceled successfully");
        await refresh();
    }
    catch (err) {
        logger.error({ error: err }, "Schedule page: Error canceling schedule:");
    }
}

function startEdit(sch: Schedule) {
    editingId = sch.id;
    editingTime = toLocalISOString(sch.nextRunAt);
}

async function saveEdit() {
    if (!editingId || !editingTime) {
        logger.error("Schedule page: Missing editing values");
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
        logger.error({ error: err }, "Schedule page: Error updating schedule:");
    }
}



async function downloadIcs() {
    if (!pageId) {
        logger.error("Schedule page: Cannot export schedules, pageId is empty");
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
        logger.debug("Schedule page: Exported schedules to iCal", filename);
    }
    catch (err) {
        logger.error({ error: err }, "Schedule page: Error exporting schedules:");
    }
    finally {
        isDownloading = false;
    }
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
        <button type="button" onclick={addSchedule} class="ml-2 px-2 py-1 bg-blue-600 text-white rounded">Add</button>
        <a href={resolvePath(`/${encodeURIComponent(project)}/${encodeURIComponent(pageTitle)}`)} class="ml-2 px-2 py-1 bg-gray-300 rounded inline-block" style="text-decoration:none; color:black">Back</a>
        <button type="button"
            onclick={downloadIcs}
            class="ml-2 px-2 py-1 bg-green-700 text-white rounded disabled:opacity-60"
            disabled={isDownloading}
            data-testid="download-ics"
        >
            {isDownloading ? "Preparing…" : "Download iCal"}
        </button>
    </div>
    <ul data-testid="schedule-list">
        {#if loadError}
            <li class="mb-2 text-red-600 bg-red-50 p-2 rounded border border-red-200" data-testid="schedule-error">
                Failed to load schedules: {loadError}
            </li>
        {/if}
        {#each schedules as sch (sch.id)}
            <li class="mb-2" data-testid="schedule-item">
                {#if editingId === sch.id}
                    <input type="datetime-local" bind:value={editingTime} class="border p-1" />
                    <button type="button" onclick={saveEdit} class="ml-2 px-2 py-1 bg-green-600 text-white rounded">Save</button>
                {:else}
                    {formatDateTime(sch.nextRunAt)}
                    <button type="button" onclick={() => startEdit(sch)} class="ml-2 px-2 py-1 bg-yellow-500 text-white rounded">
                        Edit
                    </button>
                    <button type="button" onclick={() => cancel(sch.id)} class="ml-2 px-2 py-1 bg-red-500 text-white rounded">
                        Cancel
                    </button>
                {/if}
            </li>
        {/each}
    </ul>
</div>
