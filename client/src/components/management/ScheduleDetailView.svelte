<script lang="ts">
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { userManager } from "../../auth/UserManager";
    import AuthComponent from "../AuthComponent.svelte";
    import { getLogger } from "../../lib/logger";
    import { store } from "../../stores/store.svelte";
    import { resolvePath } from "../../utils/pathUtils";
    import Breadcrumb from "../Breadcrumb.svelte";
    import { listTables, type TableRegistryEntry } from "../../services/yjstable/tableDocs";
    import ScheduleRuleEditor from "../schedule/ScheduleRuleEditor.svelte";
    import { formatDateTime } from "../../utils/dateUtils";
    import { SCHEDULE_RUN_RESULT_LABELS, summarizeScheduleRun } from "$shared/services/scheduleStatus";
    import {
        deleteScheduleRule,
        updateScheduleRule,
        type ScheduleRule,
    } from "../../services/schedule/scheduleRuleService";
    import { runScheduleRuleNow } from "../../services/schedule/scheduleRunService";
    import { isPublicProject, projectBasePath } from "../../lib/publicProject";
    import { DemoInitAborted } from "../../lib/demoInit";
    import { openRouteProject, type RouteProjectHandle } from "../../lib/routeProject";
    import { projectObjectsPath } from "../../lib/managementPaths";

    const logger = getLogger("ProjectScheduleEditPage");

    interface Props {
        projectName: string;
        ruleId: string;
    }

    let { projectName, ruleId }: Props = $props();

    // Page state
    let error: string | undefined = $state(undefined);
    let isAuthenticated = $state(false);
    let notFound = $state(false);
    let isLoading = $state(true);
    let isRunning = $state(false);
    let runError: string | undefined = $state(undefined);

    // Editor state
    let tables = $state<TableRegistryEntry[]>([]);
    let selectedTableId = $state("");
    let currentRule = $state<Partial<ScheduleRule> | undefined>(undefined);
    let runSummary = $derived(currentRule ? summarizeScheduleRun(currentRule) : undefined);
    let ruleLoaded = $state(false);
    let isDestroyed = false;
    let projectHandle: RouteProjectHandle | undefined = undefined;

    // Yjs -> UI mirror (AGENTS.md §11). The project loads asynchronously, so
    // the subscription is taken once it exists rather than at mount: opening
    // this page directly used to leave it with no observer at all, freezing
    // the execution status it shows at whatever the first load found
    // (issue #5290 REQ-008).
    let observedSchedules: NonNullable<typeof store.project>["schedules"] | undefined = undefined;
    const schedulesObserver = () => loadRuleMetadata();

    function observeSchedules(schedules: NonNullable<typeof store.project>["schedules"] | undefined) {
        if (observedSchedules === schedules) return;
        observedSchedules?.unobserveDeep(schedulesObserver);
        observedSchedules = schedules;
        observedSchedules?.observeDeep(schedulesObserver);
    }

    // Public projects stay readable for anonymous visitors. Deriving the gate
    // instead of folding the demo case into `isAuthenticated` keeps the auth
    // callbacks below from clobbering it once Firebase resolves to no user.
    let isPublicDemo = $derived(isPublicProject(projectName));
    let canAccess = $derived(isAuthenticated || isPublicDemo);
    let hasWriteAccess = $derived(isAuthenticated || isPublicDemo);

    function loadRule() {
        if (!store.project?.ydoc) return;

        tables = listTables(store.project.ydoc);

        const ruleMap = store.project.schedules.get(ruleId);
        if (!ruleMap) {
            notFound = true;
            return;
        }

        const rule: ScheduleRule = {
            name: ruleMap.get("name") as string | undefined,
            targetTableId: ruleMap.get("targetTableId") as string,
            sql: ruleMap.get("sql") as string,
            rrule: ruleMap.get("rrule") as string,
            dtstart: ruleMap.get("dtstart") as string,
            timezone: ruleMap.get("timezone") as string,
            enabled: ruleMap.get("enabled") as boolean,
            catchUp: ruleMap.get("catchUp") as boolean,
            lastRunAt: ruleMap.get("lastRunAt") as string | undefined,
            lastRunStatus: ruleMap.get("lastRunStatus") as ScheduleRule["lastRunStatus"],
            lastRunError: ruleMap.get("lastRunError") as string | undefined,
            lastRunStartedAt: ruleMap.get("lastRunStartedAt") as string | undefined,
            lastSuccessfulRunAt: ruleMap.get("lastSuccessfulRunAt") as string | undefined,
            completedAt: ruleMap.get("completedAt") as string | undefined,
            validationError: ruleMap.get("validationError") as string | undefined,
        };

        currentRule = rule;
        selectedTableId = rule.targetTableId || tables[0]?.tableId || "";
        ruleLoaded = true;
    }

    function loadRuleMetadata() {
        if (!store.project?.schedules) return;
        const ruleMap = store.project.schedules.get(ruleId);
        if (!ruleMap || !currentRule) return;

        currentRule.lastRunAt = ruleMap.get("lastRunAt") as string | undefined;
        currentRule.lastRunStatus = ruleMap.get("lastRunStatus") as ScheduleRule["lastRunStatus"];
        currentRule.lastRunError = ruleMap.get("lastRunError") as string | undefined;
        currentRule.lastRunStartedAt = ruleMap.get("lastRunStartedAt") as string | undefined;
        currentRule.lastSuccessfulRunAt = ruleMap.get("lastSuccessfulRunAt") as string | undefined;
        currentRule.completedAt = ruleMap.get("completedAt") as string | undefined;
        currentRule.validationError = ruleMap.get("validationError") as string | undefined;
    }

    async function handleAuthSuccess() {
        isAuthenticated = true;
    }

    function handleAuthLogout() {
        isAuthenticated = false;
    }

    async function loadProject() {
        if (!projectName || !canAccess) return;

        logger.info(`Loading schedule editor: project="${projectName}", rule="${ruleId}"`);
        isLoading = true;
        error = undefined;
        notFound = false;
        ruleLoaded = false;

        try {
            // Releases the previous reference before taking another, so a
            // parameter change cannot leak a demo client reference.
            projectHandle?.release();
            projectHandle = undefined;
            projectHandle = await openRouteProject(projectName, () => isDestroyed);
            if (!projectHandle) {
                notFound = true;
                return;
            }
            if (isDestroyed) return;

            if (!store.project?.ydoc) {
                error = "Failed to load project document.";
                return;
            }

            observeSchedules(store.project.schedules);
            loadRule();
        } catch (err) {
            if (err instanceof DemoInitAborted) return;
            logger.error({ error: err }, "Failed to load schedule editor page:");
            error = err instanceof Error ? err.message : "An error occurred while loading the schedule.";
        } finally {
            isLoading = false;
        }
    }

    $effect(() => {
        if (canAccess && projectName && ruleId) {
            loadProject();
        } else {
            isLoading = false;
        }
    });

    onMount(() => {
        isAuthenticated = userManager.getCurrentUser() !== null;

        return () => {
            isDestroyed = true;
            observeSchedules(undefined);
            projectHandle?.release();
            projectHandle = undefined;
        };
    });

    function backToProject() {
        goto(resolvePath(projectBasePath(projectName)));
    }

    // Duplicate now opens Object Manager with this Schedule preselected
    // instead of the old per-object recursive dependency-scope chooser
    // (issue #5153 §10): the user can duplicate it alone from there, or
    // expand the set first via `Select related`.
    function openDuplicate() {
        goto(resolvePath(`${projectObjectsPath(projectName)}?selected=${encodeURIComponent(ruleId)}`));
    }

    function saveRule(ruleData: Partial<ScheduleRule> & { sql: string; rrule: string; targetTableId: string }) {
        if (!store.project) return;

        try {
            updateScheduleRule(store.project, ruleId, { ...ruleData, targetTableId: selectedTableId });
        } catch (err) {
            logger.error({ error: err }, "Failed to save schedule rule:");
            error = err instanceof Error ? err.message : "Failed to save schedule rule.";
        }
    }

    function handleDelete() {
        if (!store.project) return;
        if (confirm("Are you sure you want to delete this scheduled SQL?")) {
            deleteScheduleRule(store.project, ruleId);
            backToProject();
        }
    }

    async function handleRunNow() {
        if (!store.project || !projectHandle) return;
        isRunning = true;
        runError = undefined;
        try {
            const res = await runScheduleRuleNow(projectHandle.projectId, ruleId);
            if (!res.ok) {
                runError = res.error || "Failed to run rule";
            }
        } finally {
            isRunning = false;
        }
    }
</script>

<svelte:head>
    <title>Scheduled SQL | Outliner</title>
</svelte:head>

<main class="w-full h-[calc(100vh-5rem)] max-w-7xl mx-auto px-4 py-8 md:px-8 flex flex-col">
    <div class="mb-4 flex-shrink-0">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: projectName || "Project", href: resolvePath(projectBasePath(projectName)) },
            { label: "Scheduled SQL" }
        ]} />
    </div>

    <div class="mb-4 flex items-center justify-between flex-shrink-0">
        <h1 class="text-2xl font-bold">Edit Scheduled SQL</h1>
        {#if ruleLoaded}
            <div class="flex space-x-2">
                <button
                    class="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    onclick={handleRunNow}
                    disabled={isRunning || isPublicDemo}
                    title={isPublicDemo ? "Run now is disabled for guest access" : "Runs the saved SQL"}
                    data-testid="run-now-schedule"
                >
                    {isRunning ? "Running…" : "Run now"}
                </button>
                <button
                    class="px-4 py-2 border border-red-300 text-red-600 rounded hover:bg-red-50"
                    onclick={handleDelete}
                    data-testid="delete-schedule"
                >
                    Delete
                </button>
                {#if hasWriteAccess}
                    <button
                        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
                        onclick={openDuplicate}
                        data-testid="duplicate-schedule"
                    >
                        Duplicate Schedule
                    </button>
                {/if}
            </div>
        {/if}
    </div>

    <!-- Authentication component -->
    <div class="auth-section mb-6 flex-shrink-0">
        {#if isPublicDemo}
            <div class="user-info bg-gray-50 p-3 rounded text-sm text-gray-700 border border-gray-200">
                Public demo / Guest access
            </div>
        {:else}
            <AuthComponent
                onAuthSuccess={handleAuthSuccess}
                onAuthLogout={handleAuthLogout}
            />
        {/if}
    </div>

    {#if isLoading}
        <div class="flex justify-center py-8">
            <div class="flex flex-col items-center justify-center space-y-4">
                <div class="text-gray-600 text-sm font-medium">Loading...</div>
            </div>
        </div>
    {:else if error}
        <div class="rounded-md bg-red-50 p-4">
            <p class="text-sm text-red-700">{error}</p>
        </div>
    {:else if notFound}
        <div class="rounded-md bg-yellow-50 p-4">
            <p class="text-sm text-yellow-700">Scheduled SQL not found.</p>
        </div>
    {:else if !canAccess}
        <div class="rounded-md bg-blue-50 p-4">
            <p class="text-sm text-blue-700">Please log in.</p>
        </div>
    {:else if ruleLoaded}
        <div class="flex-grow min-h-0 overflow-y-auto bg-white">
            {#if runError}
                <div class="mb-4 text-sm text-red-700 bg-red-50 p-3 rounded border border-red-100 font-mono">
                    {runError}
                </div>
            {/if}

            <!-- Same execution semantics as the Schedules Manager (issue
                 #5290): `Last run` is when the attempt started, `Last
                 successful run` when the most recent success completed. -->
            {#if runSummary && runSummary.result !== "never"}
                <div class="mb-6 p-4 border rounded bg-gray-50 flex flex-col space-y-2" data-testid="schedule-detail-run-summary">
                    <div class="text-sm">
                        <span class="font-medium">Last run:</span>
                        {runSummary.lastRunStartedAt ? formatDateTime(runSummary.lastRunStartedAt) : "—"}
                        <span class="ml-2 text-xs px-2 py-0.5 rounded font-medium bg-gray-200 text-gray-800" data-testid="schedule-detail-result">
                            {SCHEDULE_RUN_RESULT_LABELS[runSummary.result]}
                        </span>
                    </div>
                    <div class="text-sm">
                        <span class="font-medium">Last successful run:</span>
                        {runSummary.lastSuccessfulRunAt ? formatDateTime(runSummary.lastSuccessfulRunAt) : "—"}
                    </div>
                    {#if runSummary.lastRunError}
                        <div class="text-sm text-red-700 bg-red-50 p-2 rounded border border-red-100 font-mono">
                            {runSummary.lastRunError}
                        </div>
                    {/if}
                </div>
            {/if}

            <div class="mb-4">
                <label class="block text-sm font-medium mb-1" for="target-table-select">Target Table</label>
                <select
                    id="target-table-select"
                    class="w-full max-w-sm p-2 border rounded"
                    bind:value={selectedTableId}
                    data-testid="target-table-select"
                >
                    {#if tables.length === 0}
                        <option value="">No tables available</option>
                    {:else}
                        {#each tables as t (t.tableId)}
                            <option value={t.tableId}>{t.name || "Untitled table"}</option>
                        {/each}
                    {/if}
                </select>
            </div>

            {#key ruleId}
                <ScheduleRuleEditor
                    tableId={selectedTableId}
                    rule={currentRule}
                    onSave={saveRule}
                    onCancel={backToProject}
                />
            {/key}
        </div>
    {/if}
</main>
