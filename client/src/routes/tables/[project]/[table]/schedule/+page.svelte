<script lang="ts">
    import { page } from "$app/stores";
    import { onMount } from "svelte";
    import { userManager } from "../../../../../auth/UserManager";
    import AuthComponent from "../../../../../components/AuthComponent.svelte";
    import { getLogger } from "../../../../../lib/logger";
    import { getYjsClientByProjectTitle } from "../../../../../services";
    import { store } from "../../../../../stores/store.svelte";
    import { yjsStore } from "../../../../../stores/yjsStore.svelte";
    import Breadcrumb from "../../../../../components/Breadcrumb.svelte";
    import { listTables } from "../../../../../services/yjstable/tableDocs";
    import ScheduleRuleList from "../../../../../components/schedule/ScheduleRuleList.svelte";
    import ScheduleRuleEditor from "../../../../../components/schedule/ScheduleRuleEditor.svelte";
    import { createScheduleRule, deleteScheduleRule, updateScheduleRule, type ScheduleRule } from "../../../../../services/schedule/scheduleRuleService";
    import { DEMO_PROJECT_NAME } from "../../../../../lib/demoSeed";

    const logger = getLogger("TableSchedulePage");

    // URL params
    let projectName = $derived($page.params.project);
    let tableName = $derived($page.params.table);

    // Page state
    let error: string | undefined = $state(undefined);
    let isAuthenticated = $state(false);
    let notFound = $state(false);
    let isLoading = $state(true);
    let tableId: string | undefined = $state(undefined);

    // Editor state
    let isEditing = $state(false);
    let currentRuleId: string | undefined = $state(undefined);
    let currentRule: Partial<ScheduleRule> | undefined = $state(undefined);

    // Reactive rules derived from the project doc
    let rules = $state<{ id: string, rule: ScheduleRule }[]>([]);

    function loadRules() {
        if (!store.project || !tableId) return;

        const project = store.project;
        const newRules: { id: string, rule: ScheduleRule }[] = [];

        project.schedules.forEach((ruleMap, ruleId) => {
            if (ruleMap.get("targetTableId") === tableId) {
                newRules.push({
                    id: ruleId,
                    rule: {
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
                    }
                });
            }
        });

        rules = newRules;
    }

    async function handleAuthSuccess() {
        isAuthenticated = true;
    }

    function handleAuthLogout() {
        isAuthenticated = false;
    }

    async function loadTable() {
        if (!projectName || !tableName || (!isAuthenticated && projectName !== DEMO_PROJECT_NAME)) return;

        logger.info(`Loading table schedule: project="${projectName}", table="${tableName}"`);
        isLoading = true;
        error = undefined;
        notFound = false;

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

            if (!store.project?.ydoc) {
                error = "Failed to load project document.";
                return;
            }

            // Set up observer for schedules
            store.project.schedules.observeDeep(() => {
                loadRules();
            });

            const registryEntries = listTables(store.project.ydoc);
            const entry = registryEntries.find(e => e.name === tableName);
            if (!entry) {
                logger.warn(`Table "${tableName}" not found in project "${projectName}"`);
                notFound = true;
                return;
            }

            tableId = entry.tableId;
            loadRules();

        } catch (err) {
            logger.error({ error: err }, "Failed to load table schedule page:");
            error = err instanceof Error ? err.message : "An error occurred while loading the table.";
        } finally {
            isLoading = false;
        }
    }

    $effect(() => {
        if ((isAuthenticated || projectName === DEMO_PROJECT_NAME) && projectName && tableName) {
            loadTable();
        } else if (!isAuthenticated) {
            isLoading = false;
        }
    });

    onMount(() => {
        isAuthenticated = userManager.getCurrentUser() !== null || projectName === DEMO_PROJECT_NAME;
    });

    function startCreate() {
        currentRuleId = undefined;
        currentRule = undefined;
        isEditing = true;
    }

    function startEdit(id: string, rule: ScheduleRule) {
        currentRuleId = id;
        currentRule = { ...rule };
        isEditing = true;
    }

    function cancelEdit() {
        isEditing = false;
        currentRuleId = undefined;
        currentRule = undefined;
    }

    function saveRule(ruleData: Partial<ScheduleRule> & { sql: string, rrule: string, targetTableId: string }) {
        if (!store.project || !tableId) return;

        try {
            if (currentRuleId) {
                updateScheduleRule(store.project, currentRuleId, ruleData);
            } else {
                createScheduleRule(store.project, ruleData);
            }

            isEditing = false;
            currentRuleId = undefined;
            currentRule = undefined;
        } catch (err) {
            logger.error({ error: err }, "Failed to save schedule rule:");
            error = err instanceof Error ? err.message : "Failed to save schedule rule.";
        }
    }

    function handleDelete(id: string) {
        if (!store.project) return;
        if (confirm("Are you sure you want to delete this schedule rule?")) {
            deleteScheduleRule(store.project, id);
        }
    }
</script>

<svelte:head>
    <title>{tableName ? tableName + " Schedule" : "Table Schedule"} | Outliner</title>
</svelte:head>

<main class="w-full h-[calc(100vh-5rem)] max-w-7xl mx-auto px-4 py-8 md:px-8 flex flex-col">
    <div class="mb-4 flex-shrink-0">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: projectName || "Project", href: `/${encodeURIComponent(projectName)}` },
            { label: "Tables" },
            { label: tableName || "Table", href: `/tables/${encodeURIComponent(projectName)}/${encodeURIComponent(tableName)}` },
            { label: "Schedule" }
        ]} />
    </div>

    <div class="mb-4 flex items-center justify-between flex-shrink-0">
        <h1 class="text-2xl font-bold">
            {tableName || "Table"} Schedule
        </h1>
        {#if tableId && !isEditing}
            <button class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700" onclick={startCreate}>
                + New Rule
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
            <p class="text-sm text-yellow-700">Table not found.</p>
        </div>
    {:else if !isAuthenticated}
        <div class="rounded-md bg-blue-50 p-4">
            <p class="text-sm text-blue-700">Please log in.</p>
        </div>
    {:else if tableId}
        <div class="flex-grow min-h-0 bg-white">
            {#if isEditing}
                <ScheduleRuleEditor
                    tableId={tableId}
                    rule={currentRule}
                    onSave={saveRule}
                    onCancel={cancelEdit}
                />
            {:else}
                <ScheduleRuleList
                    rules={rules}
                    onEdit={startEdit}
                    onDelete={handleDelete}
                />
            {/if}
        </div>
    {/if}
</main>
