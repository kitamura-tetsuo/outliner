<script lang="ts">
    // Project-level Schedule list: /schedules/<project>.
    //
    // Schedules are project entities (issue #5012). They reference Tables — a
    // write target and whatever their SQL reads — but no Table owns them, so
    // this list is scoped to the project and never to one Table. The former
    // Table-nested list (/tables/<project>/<tableId>/schedule) redirects here.
    import { page } from "$app/stores";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { userManager } from "../../../auth/UserManager";
    import AuthComponent from "../../../components/AuthComponent.svelte";
    import Breadcrumb from "../../../components/Breadcrumb.svelte";
    import Loader from "../../../components/Loader.svelte";
    import ScheduleRuleList from "../../../components/schedule/ScheduleRuleList.svelte";
    import { getLogger } from "../../../lib/logger";
    import { store } from "../../../stores/store.svelte";
    import { listTables, type TableRegistryEntry } from "../../../services/yjstable/tableDocs";
    import {
        createScheduleRule,
        deleteScheduleRule,
        type ScheduleRule,
        scheduleTableReferences,
    } from "../../../services/schedule/scheduleRuleService";
    import { runScheduleRuleNow } from "../../../services/schedule/scheduleRunService";
    import { isPublicProject } from "../../../lib/publicProject";
    import { DemoInitAborted } from "../../../lib/demoInit";
    import { openRouteProject, type RouteProjectHandle } from "../../../lib/routeProject";

    const logger = getLogger("ProjectSchedulesPage");

    let projectName = $derived($page.params.project);

    let error: string | undefined = $state(undefined);
    let isAuthenticated = $state(false);
    let notFound = $state(false);
    let isLoading = $state(true);
    let runningRuleId: string | undefined = $state(undefined);
    let runError: string | undefined = $state(undefined);

    // Yjs -> UI mirrors (AGENTS.md §11).
    let rules = $state<{ id: string; rule: ScheduleRule; }[]>([]);
    let tables = $state<TableRegistryEntry[]>([]);
    // Table references per rule: a Schedule may reference several Tables, and
    // this list shows them all rather than pretending one is its owner.
    let referencedTables = $state<Record<string, { tableId: string; name: string; kind: string; href: string; }[]>>({});

    let isDestroyed = false;
    let projectHandle: RouteProjectHandle | undefined = undefined;
    let observedSchedules: NonNullable<typeof store.project>["schedules"] | undefined = undefined;
    const schedulesObserver = () => loadRules();

    let isPublicDemo = $derived(isPublicProject(projectName));
    let hasWriteAccess = $derived(isAuthenticated && !isPublicDemo);
    let canAccess = $derived(isAuthenticated || isPublicDemo);

    function observeSchedules(schedules: NonNullable<typeof store.project>["schedules"] | undefined) {
        if (observedSchedules === schedules) return;
        observedSchedules?.unobserveDeep(schedulesObserver);
        observedSchedules = schedules;
        observedSchedules?.observeDeep(schedulesObserver);
    }

    function loadRules() {
        const project = store.project;
        if (!project?.ydoc) return;

        tables = listTables(project.ydoc);
        const tableNames = new Map(tables.map(t => [t.tableId, t.name || "Untitled table"]));

        const nextRules: { id: string; rule: ScheduleRule; }[] = [];
        const nextReferences: Record<string, { tableId: string; name: string; kind: string; href: string; }[]> = {};

        project.schedules.forEach((ruleMap, ruleId) => {
            nextRules.push({
                id: ruleId,
                rule: {
                    name: ruleMap.get("name") as string | undefined,
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
                },
            });
            nextReferences[ruleId] = scheduleTableReferences(project, ruleId).map(reference => ({
                tableId: reference.tableId,
                name: tableNames.get(reference.tableId) ?? reference.tableId,
                kind: reference.kind === "write-target" ? "writes" : "reads",
                href: `/tables/${encodeURIComponent(projectName)}/${encodeURIComponent(reference.tableId)}`,
            }));
        });

        rules = nextRules;
        referencedTables = nextReferences;
    }

    async function handleAuthSuccess() {
        isAuthenticated = true;
    }

    function handleAuthLogout() {
        isAuthenticated = false;
    }

    async function loadProject() {
        if (!projectName || !canAccess) return;

        logger.info(`Loading project schedules: project="${projectName}"`);
        isLoading = true;
        error = undefined;
        notFound = false;

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
            loadRules();
        } catch (err) {
            if (err instanceof DemoInitAborted) return;
            logger.error({ error: err }, "Failed to load project schedules page:");
            error = err instanceof Error ? err.message : "An error occurred while loading schedules.";
        } finally {
            isLoading = false;
        }
    }

    $effect(() => {
        if (canAccess && projectName) {
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

    function scheduleHref(ruleId: string): string {
        return `/schedules/${encodeURIComponent(projectName)}/${encodeURIComponent(ruleId)}`;
    }

    function startCreate() {
        const project = store.project;
        if (!project?.ydoc || !hasWriteAccess) return;
        // A new Schedule needs a write target to be useful, but choosing one
        // does not make that Table its owner — it is just the first reference.
        const target = tables[0];
        const defaultSql = target?.sqlName
            ? `INSERT INTO "${target.sqlName}" (id) VALUES (gen_random_uuid());`
            : "";
        const ruleId = createScheduleRule(project, {
            targetTableId: target?.tableId ?? "",
            sql: defaultSql,
            rrule: "FREQ=DAILY;INTERVAL=1",
        });
        goto(scheduleHref(ruleId));
    }

    function handleEdit(id: string) {
        goto(scheduleHref(id));
    }

    function handleDelete(id: string) {
        if (!store.project || !hasWriteAccess) return;
        if (confirm("Are you sure you want to delete this schedule rule?")) {
            deleteScheduleRule(store.project, id);
        }
    }

    async function handleRunNow(id: string) {
        if (!projectName) return;
        runError = undefined;
        runningRuleId = id;
        try {
            const res = await runScheduleRuleNow(projectName, id);
            if (!res.ok) {
                runError = res.error || "Failed to run rule";
            }
        } finally {
            runningRuleId = undefined;
        }
    }
</script>

<svelte:head>
    <title>Schedules | Outliner</title>
</svelte:head>

<main class="w-full h-[calc(100vh-5rem)] max-w-7xl mx-auto px-4 py-8 md:px-8 flex flex-col">
    <div class="mb-4 flex-shrink-0">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: projectName || "Project", href: `/${encodeURIComponent(projectName)}` },
            { label: "Schedules" }
        ]} />
    </div>

    <div class="mb-2 flex items-center justify-between flex-shrink-0">
        <h1 class="text-2xl font-bold">Schedules</h1>
        {#if hasWriteAccess && !isLoading}
            <button
                class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                onclick={startCreate}
                data-testid="project-schedule-create"
            >
                + New Rule
            </button>
        {/if}
    </div>
    <p class="mb-4 text-sm text-gray-600 flex-shrink-0">
        Schedules belong to this project. A schedule may reference several tables; no table owns it.
    </p>

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
            <div class="flex flex-col items-center justify-center space-y-4" aria-busy="true" aria-live="polite" role="status">
                <Loader />
                <div class="text-gray-600 text-sm font-medium">Loading...</div>
            </div>
        </div>
    {:else if error}
        <div class="rounded-md bg-red-50 p-4">
            <p class="text-sm text-red-700">{error}</p>
        </div>
    {:else if notFound}
        <div class="rounded-md bg-yellow-50 p-4">
            <p class="text-sm text-yellow-700">Project not found.</p>
        </div>
    {:else if !canAccess}
        <div class="rounded-md bg-blue-50 p-4">
            <p class="text-sm text-blue-700">Please log in.</p>
        </div>
    {:else}
        <div class="flex-grow min-h-0 overflow-y-auto" data-testid="project-schedule-list">
            {#if runError}
                <div class="mb-3 text-xs text-red-700 bg-red-50 p-2 rounded border border-red-100 font-mono">
                    {runError}
                </div>
            {/if}
            <ScheduleRuleList
                {rules}
                {runningRuleId}
                onRunNow={handleRunNow}
                onEdit={handleEdit}
                onDelete={handleDelete}
                tableReferences={referencedTables}
            />
        </div>
    {/if}
</main>
