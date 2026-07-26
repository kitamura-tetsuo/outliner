<script lang="ts">
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { userManager } from "../../../../auth/UserManager";
    import AuthComponent from "../../../../components/AuthComponent.svelte";
    import { getLogger } from "../../../../lib/logger";
    import { getYjsClientByProjectTitle } from "../../../../services";
    import { store } from "../../../../stores/store.svelte";
    import { yjsStore } from "../../../../stores/yjsStore.svelte";
    import Breadcrumb from "../../../../components/Breadcrumb.svelte";
    import { listTables, type TableRegistryEntry } from "../../../../services/yjstable/tableDocs";
    import ScheduleRuleEditor from "../../../../components/schedule/ScheduleRuleEditor.svelte";
    import { formatDateTime } from "../../../../utils/dateUtils";
    import {
        deleteScheduleRule,
        updateScheduleRule,
        type ScheduleRule,
    } from "../../../../services/schedule/scheduleRuleService";
    import { DEMO_PROJECT_NAME } from "../../../../lib/demoSeed";

    const logger = getLogger("ProjectScheduleEditPage");

    // URL params
    let projectName = $derived($page.params.project);
    let ruleId = $derived($page.params.ruleId);

    // Page state
    let error: string | undefined = $state(undefined);
    let isAuthenticated = $state(false);
    let notFound = $state(false);
    let isLoading = $state(true);

    // Editor state
    let tables = $state<TableRegistryEntry[]>([]);
    let selectedTableId = $state("");
    let currentRule = $state<Partial<ScheduleRule> | undefined>(undefined);
    let ruleLoaded = $state(false);

    function loadRule() {
        if (!store.project?.ydoc) return;

        tables = listTables(store.project.ydoc);

        const ruleMap = store.project.schedules.get(ruleId);
        if (!ruleMap) {
            notFound = true;
            return;
        }

        const rule: ScheduleRule = {
            targetTableId: ruleMap.get("targetTableId") as string,
            sql: ruleMap.get("sql") as string,
            rrule: ruleMap.get("rrule") as string,
            dtstart: ruleMap.get("dtstart") as string,
            timezone: ruleMap.get("timezone") as string,
            enabled: ruleMap.get("enabled") as boolean,
            catchUp: ruleMap.get("catchUp") as boolean,
            lastRunAt: ruleMap.get("lastRunAt") as string | undefined,
            lastRunStatus: ruleMap.get("lastRunStatus") as "ok" | "error" | undefined,
            lastRunError: ruleMap.get("lastRunError") as string | undefined,
            completedAt: ruleMap.get("completedAt") as string | undefined,
            validationError: ruleMap.get("validationError") as string | undefined,
        };

        currentRule = rule;
        selectedTableId = rule.targetTableId || tables[0]?.tableId || "";
        ruleLoaded = true;
    }

    async function handleAuthSuccess() {
        isAuthenticated = true;
    }

    function handleAuthLogout() {
        isAuthenticated = false;
    }

    async function loadProject() {
        if (!projectName || (!isAuthenticated && projectName !== DEMO_PROJECT_NAME)) return;

        logger.info(`Loading schedule editor: project="${projectName}", rule="${ruleId}"`);
        isLoading = true;
        error = undefined;
        notFound = false;
        ruleLoaded = false;

        try {
            const client = await getYjsClientByProjectTitle(projectName);
            if (!client) {
                notFound = true;
                return;
            }

            yjsStore.yjsClient = client as unknown as NonNullable<typeof yjsStore.yjsClient>;
            const projectDoc = client.getProject?.();
            if (projectDoc) {
                store.project = projectDoc as unknown as NonNullable<typeof store.project>;
            }

            if (!store.project?.ydoc) return;

            loadRule();
        } catch (err) {
            logger.error({ error: err }, "Failed to load schedule editor page:");
            error = err instanceof Error ? err.message : "An error occurred while loading the schedule.";
        } finally {
            isLoading = false;
        }
    }

    $effect(() => {
        if ((isAuthenticated || projectName === DEMO_PROJECT_NAME) && projectName && ruleId) {
            loadProject();
        }
    });

    onMount(() => {
        isAuthenticated = userManager.getCurrentUser() !== null || projectName === DEMO_PROJECT_NAME;
    });

    function backToProject() {
        goto(`/${encodeURIComponent(projectName)}`);
    }

    function saveRule(ruleData: Partial<ScheduleRule> & { sql: string; rrule: string; targetTableId: string }) {
        if (!store.project) return;

        try {
            updateScheduleRule(store.project, ruleId, { ...ruleData, targetTableId: selectedTableId });
            backToProject();
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
</script>

<svelte:head>
    <title>Scheduled SQL | Outliner</title>
</svelte:head>

<main class="w-full h-[calc(100vh-5rem)] max-w-7xl mx-auto px-4 py-8 md:px-8 flex flex-col">
    <div class="mb-4 flex-shrink-0">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: projectName || "Project", href: `/${encodeURIComponent(projectName)}` },
            { label: "Scheduled SQL" }
        ]} />
    </div>

    <div class="mb-4 flex items-center justify-between flex-shrink-0">
        <h1 class="text-2xl font-bold">Edit Scheduled SQL</h1>
        {#if ruleLoaded}
            <button
                class="px-4 py-2 border border-red-300 text-red-600 rounded hover:bg-red-50"
                onclick={handleDelete}
                data-testid="delete-schedule"
            >
                Delete
            </button>
        {/if}
    </div>

    <!-- Authentication component -->
    <div class="auth-section mb-6 flex-shrink-0">
        <AuthComponent
            onAuthSuccess={handleAuthSuccess}
            onAuthLogout={handleAuthLogout}
        />
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
    {:else if !isAuthenticated}
        <div class="rounded-md bg-blue-50 p-4">
            <p class="text-sm text-blue-700">Please log in.</p>
        </div>
    {:else if ruleLoaded}
        <div class="flex-grow min-h-0 overflow-y-auto bg-white">
            {#if currentRule?.lastRunAt}
                <div class="mb-6 p-4 border rounded bg-gray-50 flex flex-col space-y-2">
                    <div class="text-sm">
                        <span class="font-medium">Last run:</span> {formatDateTime(new Date(currentRule.lastRunAt).getTime())}
                        {#if currentRule.lastRunStatus === "ok"}
                            <span class="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded font-medium">OK</span>
                        {:else if currentRule.lastRunStatus === "error"}
                            <span class="ml-2 text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded font-medium">Error</span>
                        {/if}
                    </div>
                    {#if currentRule.lastRunStatus === "error" && currentRule.lastRunError}
                        <div class="text-sm text-red-700 bg-red-50 p-2 rounded border border-red-100 font-mono">
                            {currentRule.lastRunError}
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
