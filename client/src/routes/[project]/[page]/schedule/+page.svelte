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
import { yjsStore } from "../../../../stores/yjsStore.svelte";
import type { Item } from "../../../../schema/app-schema";

// Import the load function from parent scope
// We'll trigger it if the store is not properly initialized
let project = $state("");
let pageTitle = $state("");
let pageId = $state("");
let schedules = $state<Schedule[]>([]);
let publishTime = $state("");
let editingId = $state("");
let editingTime = $state("");
let isDownloading = $state(false);

// Function to trigger parent page load
async function triggerParentPageLoad() {
    // Access the parent page's loadProjectAndPage via window if available
    const win = window as any;
    if (win.loadProjectAndPage) {
        // Set loading in progress to prevent duplicate calls
        const loadInProgressKey = "__loadingInProgress";
        if (!win[loadInProgressKey]) {
            win[loadInProgressKey] = true;
            try {
                await win.loadProjectAndPage();
            } finally {
                win[loadInProgressKey] = false;
            }
        }
    }
}

// Track navigation state for debugging
let navState = $state({
    onMountCount: 0,
    needsNavigation: false,
    navigationDone: false,
    pageIdResolved: false,
});

onMount(async () => {
    navState.onMountCount++;
    console.log("Schedule page: onMount started", {
        count: navState.onMountCount,
        project,
        pageTitle,
        storeProjectItems: store.project?.items?.length ?? 0,
    });

    const params = $page.params as { project: string; page: string; };
    project = decodeURIComponent(params.project || "");
    pageTitle = decodeURIComponent(params.page || "");

    // E2E stability: Check if project data is already loaded
    // IMPORTANT: Also check if the loaded project has the correct title (handles store reset during navigation)
    const currentProjectTitle = store.project?.title ?? "";
    const isCorrectProject = currentProjectTitle === project;
    const hasProjectData = store.project?.items?.length > 0 && isCorrectProject;

    // Check if we have a saved pageId in session storage
    const sessionKey = `schedule:lastPageChildId:${encodeURIComponent(project)}:${encodeURIComponent(pageTitle)}`;
    const savedPageId = typeof window !== "undefined" ? window.sessionStorage?.getItem(sessionKey) : null;

    console.log("Schedule page: Initial check", {
        hasProjectData,
        itemsLength: store.project?.items?.length ?? 0,
        isCorrectProject,
        currentProjectTitle,
        expectedProject: project,
        hasSavedPageId: !!savedPageId,
        savedPageId: savedPageId ?? "null"
    });

    // If project data is not loaded OR we don't have a saved pageId, we need to navigate to main page first
    // Only navigate if store is empty or project title doesn't match
    if (!hasProjectData || !savedPageId) {
        console.log("Schedule page: Project data not loaded or no saved pageId, navigating to main page first", {
            hasProjectData,
            hasSavedPageId: !!savedPageId,
            storeProjectItems: store.project?.items?.length ?? 0,
            storeProjectTitle: store.project?.title ?? "null"
        });

        // Navigate to main page to trigger loadProjectAndPage
        const mainPageUrl = `/${encodeURIComponent(project)}/${encodeURIComponent(pageTitle)}`;
        console.log("Schedule page: Navigating to main page:", mainPageUrl);
        await goto(mainPageUrl, { waitUntil: "networkidle" });
        console.log("Schedule page: Back from main page, waiting for store.project to be populated...");

        // Wait for store.project to be populated after navigation
        for (let i = 0; i < 50; i++) {
            if (store.project?.items?.length > 0) {
                console.log("Schedule page: store.project populated after", i * 100, "ms");
                break;
            }
            await new Promise(r => setTimeout(r, 100));
        }
        console.log("Schedule page: store.project?.items?.length =", store.project?.items?.length ?? 0);

        // Navigate back to schedule page
        const scheduleUrl = `/${encodeURIComponent(project)}/${encodeURIComponent(pageTitle)}/schedule`;
        console.log("Schedule page: Navigating back to schedule:", scheduleUrl);
        await goto(scheduleUrl, { waitUntil: "networkidle" });
        console.log("Schedule page: Back on schedule page, store.project?.items?.length =", store.project?.items?.length ?? 0);
    } else {
        console.log("Schedule page: Using saved pageId, no navigation needed");
    }

    // E2E stabilization: Wait for parent page's loadProjectAndPage to complete
    // Wait until the parent page is completely loaded
    let parentLoadWaitAttempts = 0;
    const maxParentLoadWaitAttempts = 200; // 20 seconds
    while (parentLoadWaitAttempts < maxParentLoadWaitAttempts) {
        // Check if yjsStore.yjsClient is set (indicates main page loadProjectAndPage has completed)
        // We check both the global window reference and the imported yjsStore
        const win = window as any;
        const yjsClientExists = (win.loadProjectAndPage !== undefined) &&
                               (yjsStore.yjsClient !== undefined || win.loadProjectAndPage?.yjsClient !== undefined);

        // Check if the parent page has finished loading
        // We check multiple conditions to determine if loading is complete
        const gs = (window as any).generalStore;
        const hasProject = !!gs?.project;
        const hasCurrentPage = !!gs?.currentPage;
        const projectItems = gs?.project?.items;
        const projectItemsLength = projectItems?.length ?? 0;
        const projectHasItems = projectItemsLength > 0;

        if (hasProject && hasCurrentPage && projectHasItems) {
            console.log("Schedule page: Parent page loading complete", {
                hasProject,
                hasCurrentPage,
                projectHasItems,
                currentPageTitle: gs?.currentPage?.text?.toString?.() ?? "",
            });
            break;
        }

        // Wait for yjsStore.yjsClient to be set (indicates main page loadProjectAndPage has completed)
        if (!yjsClientExists) {
            await new Promise(resolve => setTimeout(resolve, 100));
            parentLoadWaitAttempts++;
            continue;
        }

        // If project exists but has no items, try to trigger parent load
        if (hasProject && !projectHasItems) {
            console.log("Schedule page: Project exists but has no items, triggering parent load");
            await triggerParentPageLoad();
        }

        await new Promise(resolve => setTimeout(resolve, 100));
        parentLoadWaitAttempts++;
    }

    // After waiting, check store.project directly for debugging
    console.log("Schedule page: Final store state", {
        storeProjectTitle: store.project?.title ?? "null",
        storeProjectItemsLength: store.project?.items?.length ?? 0,
        storeCurrentPageTitle: store.currentPage?.text?.toString?.() ?? "null",
        gsProjectTitle: ((window as any).generalStore?.project?.title) ?? "null",
        gsProjectItemsLength: ((window as any).generalStore?.project?.items?.length) ?? 0,
    });

    let sessionPinnedPageId: string | undefined;
    // 0) Read the pageId pinned in the session as a candidate (but do not return immediately, check if it matches the current page)
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
    // If there is a pageId saved in the session, adopt it with highest priority.
    // However, verify whether the pageId belongs to the page corresponding to the current pageTitle
    if (sessionPinnedPageId) {
        // Validate that sessionPinnedPageId actually belongs to current pageTitle
        // Also check store.project.items as store.pages?.current might not be populated yet
        let isValid = false;
        let validatedPageId: string | undefined;

        // First check store.project.items (more reliable after reload)
        try {
            const projAny = store.project as any;
            if (projAny?.items) {
                const projItems = projAny.items;
                const projLen = projItems?.length ?? 0;
                console.log("Schedule page: Checking session pageId in store.project.items", {
                    sessionPageId: sessionPinnedPageId,
                    projectItemsCount: projLen
                });
                for (let i = 0; i < projLen; i++) {
                    const p = projItems?.at ? projItems.at(i) : projItems[i];
                    if (!p) continue;
                    const pId = String(p.id);
                    const match = pId === String(sessionPinnedPageId);
                    console.log("Schedule page:   Item", i, "id=", pId, "title=", p.text?.toString?.() ?? "", "match=", match);
                    if (match) {
                        const title = p.text?.toString?.() ?? "";
                        if (title.toLowerCase() === pageTitle.toLowerCase()) {
                            isValid = true;
                            validatedPageId = sessionPinnedPageId;
                            console.log("Schedule page: Session pageId validated in project.items");
                            break;
                        }
                    }
                }
            } else {
                console.log("Schedule page: store.project.items is empty or undefined");
            }
        } catch (e) {
            console.log("Schedule page: Error checking project.items:", e);
        }

        // If not found in project.items, check store.pages?.current
        if (!isValid) {
            try {
                const items = store.pages?.current;
                const len = items?.length ?? 0;
                console.log("Schedule page: Checking session pageId in store.pages.current", {
                    sessionPageId: sessionPinnedPageId,
                    pagesCurrentCount: len
                });
                for (let i = 0; i < len; i++) {
                    const p = items?.at(i);
                    if (!p) continue;
                    const pId = String(p.id);
                    const match = pId === String(sessionPinnedPageId);
                    console.log("Schedule page:   Page", i, "id=", pId, "title=", p.text?.toString?.() ?? "", "match=", match);
                    if (match) {
                        const title = p.text?.toString?.() ?? "";
                        if (title.toLowerCase() === pageTitle.toLowerCase()) {
                            isValid = true;
                            validatedPageId = sessionPinnedPageId;
                            console.log("Schedule page: Session pageId validated in pages.current");
                            break;
                        }
                    }
                }
            } catch (e) {
                console.log("Schedule page: Error checking pages.current:", e);
            }
        }

        if (isValid && validatedPageId) {
            pageId = validatedPageId;
            console.log("Schedule page: Using validated session pinned pageId=", pageId);
        } else {
            console.log("Schedule page: Session pinned pageId NOT found, will resolve fresh", {
                sessionPinnedPageId,
                pageTitle,
                storeProjectItemsLength: store.project?.items?.length ?? 0,
                storePagesCurrentLength: store.pages?.current?.length ?? 0
            });
            sessionPinnedPageId = undefined; // Clear so we don't use stale value
        }
    }

    // Wait up to 20 seconds until store.currentPage is set and points to the correct page
    // E2E stabilization: Wait for parent page's loadProjectAndPage to complete
    let waitAttempts = 0;
    const maxWaitAttempts = 200; // 20 seconds
    let foundPageRef: Item | undefined;

    while (waitAttempts < maxWaitAttempts) {
        // Check if we already found the page
        if (foundPageRef) {
            break;
        }

        // Check store.currentPage first
        const current = store.currentPage;
        if (current) {
            const currentTitle = current?.text?.toString?.() ?? "";
            if (currentTitle.toLowerCase() === pageTitle.toLowerCase()) {
                foundPageRef = current;
                break;
            }
        }

        // Check store.pages?.current
        try {
            const items = store.pages?.current;
            const len = items?.length ?? 0;
            for (let i = 0; i < len; i++) {
                const p = items?.at(i);
                if (!p) continue;
                const title = p.text?.toString?.() ?? "";
                if (title.toLowerCase() === pageTitle.toLowerCase()) {
                    foundPageRef = p;
                    break;
                }
            }
        } catch {}

        // Also check store.project.items directly
        if (!foundPageRef) {
            try {
                const projAny = store.project as any;
                if (projAny && typeof projAny.findPage === "function") {
                    // Try to find page by iterating through project items
                    const projItems = projAny.items;
                    const projLen = projItems?.length ?? 0;
                    for (let i = 0; i < projLen; i++) {
                        const p = projItems?.at ? projItems.at(i) : projItems[i];
                        if (!p) continue;
                        const title = p.text?.toString?.() ?? "";
                        if (title.toLowerCase() === pageTitle.toLowerCase()) {
                            foundPageRef = p;
                            break;
                        }
                    }
                }
            } catch {}
        }

        if (foundPageRef) {
            break;
        }

        await new Promise(resolve => setTimeout(resolve, 100));
        waitAttempts++;
    }
    console.log("Schedule page: After wait", {
        waitAttempts,
        hasFoundPage: !!foundPageRef,
        foundPageTitle: foundPageRef?.text?.toString?.() ?? "",
        hasCurrentPage: !!store.currentPage,
        currentPageTitle: store.currentPage?.text?.toString?.() ?? "",
        hasProject: !!store.project,
        projectItemsLength: store.project?.items?.length ?? 0,
        pageTitle,
        hasPages: !!store.pages?.current,
        pagesLength: store.pages?.current?.length ?? 0,
    });

    // If we found the page during the wait, use it
    if (foundPageRef && !pageId) {
        pageId = String(foundPageRef.id ?? "");
        console.log("Schedule page: Found page during wait", { pageId, title: foundPageRef.text?.toString?.() });
    }

    // 1) Top priority: Use when currentPage points to the current page (exclude cases where values from other pages remain)
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

    // 2) If currentPage is undetermined, identify the corresponding page from the URL's pageTitle
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

    // 3) Use the session candidate as a last resort (E2E stabilization)
    if (!pageId && sessionPinnedPageId) {
        pageId = sessionPinnedPageId;
        console.log("Schedule page: Using session fallback pageId=", sessionPinnedPageId);
    }

    // Wait for page subdocument to be connected before proceeding (E2E stability)
    if (pageId) {
        try {
            const yjsClient = yjsStore.yjsClient;
            if (yjsClient) {
                for (let waitIter = 0; waitIter < 50; waitIter++) {
                    const pageConn = yjsClient.getPageConnection?.(pageId);
                    if (pageConn) {
                        // Get the page reference to check if items are synced
                        const currentItems = store.pages?.current;
                        const len = currentItems?.length ?? 0;
                        let pageRef: Item | undefined;
                        for (let i = 0; i < len; i++) {
                            const p = currentItems?.at(i);
                            if (!p) continue;
                            if (String(p.id) === String(pageId)) {
                                pageRef = p;
                                break;
                            }
                        }
                        if (pageRef) {
                            const itemCount = pageRef?.items?.length ?? 0;
                            if (itemCount > 0) {
                                console.log("Schedule page: Page subdocument connected with items", { pageId, itemCount });
                                break;
                            }
                        }
                    }
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        } catch (e) {
            console.warn("Schedule page: Error waiting for page connection:", e);
        }
    }

    if (!pageId) {
        console.error("Schedule page: pageId is empty, cannot load schedules");
        return;
    }

    // Save pageId to session storage for stability across reloads
    try {
        if (typeof window !== "undefined") {
            const key = `schedule:lastPageChildId:${encodeURIComponent(project)}:${encodeURIComponent(pageTitle)}`;
            window.sessionStorage?.setItem(key, String(pageId));
            console.log("Schedule page: Saved pageId to sessionStorage:", pageId);
        }
    } catch {}

    console.log("Schedule page: Final pageId before refresh:", pageId);
    await refresh();

    // E2E stability: Export refresh function to window for test access
    if (typeof window !== "undefined") {
        (window as any).refreshSchedules = async (pid?: string) => {
            console.log("Schedule page: E2E refreshSchedules called with pid=", pid);
            if (pid) {
                pageId = pid;
            }
            await refresh();
        };
    }
});

// E2E stability: Re-call refresh when pageId changes (handles race conditions during navigation)
$effect(() => {
    if (pageId) {
        console.log("Schedule page: $effect triggered with pageId:", pageId, "schedules.length:", schedules.length);
        // Small delay to ensure DOM is ready
        setTimeout(() => {
            refresh();
        }, 100);
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
    <!-- Debug info for E2E troubleshooting -->
    <div class="text-xs text-gray-400 mb-2" data-testid="schedule-debug-info">
        Debug: currentPage={store.currentPage?.text?.toString?.() ?? "null"},
        pages={store.pages?.current?.length ?? 0},
        project={store.project?.title ?? "null"},
        projectItems={store.project?.items?.length ?? 0},
        pageTitle={pageTitle}
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
