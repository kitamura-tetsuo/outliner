<script lang="ts">
    // Project-level Calendar list: /:project/-/calendars.
    import { onMount } from "svelte";
    import { userManager } from "../../auth/UserManager";
    import AuthComponent from "../AuthComponent.svelte";
    import Breadcrumb from "../Breadcrumb.svelte";
    import Loader from "../Loader.svelte";
    import { getLogger } from "../../lib/logger";
    import { resolvePath } from "../../utils/pathUtils";
    import { store } from "../../stores/store.svelte";
    import { listCalendars, type CalendarListEntry } from "../../services/calendar/calendarService";
    import { isPublicProject, projectBasePath } from "../../lib/publicProject";
    import { projectCalendarPath } from "../../lib/managementPaths";
    import { DemoInitAborted } from "../../lib/demoInit";
    import { openRouteProject, type RouteProjectHandle } from "../../lib/routeProject";
    import { Project } from "$shared/app-schema";

    const logger = getLogger("ProjectCalendarsPage");

    interface Props {
        projectName: string;
    }

    let { projectName }: Props = $props();

    let error: string | undefined = $state(undefined);
    let isAuthenticated = $state(false);
    let notFound = $state(false);
    let isLoading = $state(true);
    let calendars = $state<CalendarListEntry[]>([]);

    let isDestroyed = false;
    let projectHandle: RouteProjectHandle | undefined = undefined;
    let observedCalendars: NonNullable<typeof store.project>["calendars"] | undefined = undefined;
    const calendarsObserver = () => refresh();
    // Bumped on every load; a response that resolves after a newer load has
    // started is stale and must not overwrite the state that load produced
    // (client-side navigation between two projects' calendar lists can
    // resolve the requests out of order).
    let loadGeneration = 0;

    let isPublicDemo = $derived(isPublicProject(projectName));
    let canAccess = $derived(isAuthenticated || isPublicDemo);

    function refresh() {
        if (!store.project?.ydoc) return;
        calendars = listCalendars(Project.fromDoc(store.project.ydoc));
    }

    function observeCalendars(calendarsMap: NonNullable<typeof store.project>["calendars"] | undefined) {
        if (observedCalendars === calendarsMap) return;
        observedCalendars?.unobserveDeep(calendarsObserver);
        observedCalendars = calendarsMap;
        observedCalendars?.observeDeep(calendarsObserver);
    }

    async function handleAuthSuccess() {
        isAuthenticated = true;
    }

    function handleAuthLogout() {
        isAuthenticated = false;
    }

    async function loadProject() {
        if (!projectName || !canAccess) return;
        const generation = ++loadGeneration;

        isLoading = true;
        error = undefined;
        notFound = false;

        try {
            projectHandle?.release();
            projectHandle = undefined;
            const handle = await openRouteProject(projectName, () => isDestroyed);
            if (generation !== loadGeneration) {
                // A newer load has since started; this response is stale.
                handle?.release();
                return;
            }
            projectHandle = handle;
            if (!projectHandle) {
                notFound = true;
                return;
            }
            if (isDestroyed) return;

            if (!store.project?.ydoc) {
                error = "Failed to load project document.";
                return;
            }

            observeCalendars(store.project.calendars);
            refresh();
        } catch (err) {
            if (err instanceof DemoInitAborted) return;
            if (generation !== loadGeneration) return;
            logger.error({ error: err }, "Failed to load project calendars page:");
            error = err instanceof Error ? err.message : "An error occurred while loading calendars.";
        } finally {
            if (generation === loadGeneration) isLoading = false;
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
            observeCalendars(undefined);
            projectHandle?.release();
            projectHandle = undefined;
        };
    });

    // Addressed by id, not display name: names are not unique (createCalendar
    // and renameCalendar both permit duplicates), so two calendars sharing a
    // name must still resolve to distinct links.
    function calendarHref(id: string): string {
        return resolvePath(projectCalendarPath(projectName, id));
    }
</script>

<svelte:head>
    <title>Calendars | Outliner</title>
</svelte:head>

<main class="w-full max-w-7xl mx-auto px-4 py-8 md:px-8 flex flex-col">
    <div class="mb-4 flex-shrink-0">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: projectName || "Project", href: resolvePath(projectBasePath(projectName)) },
            { label: "Calendars" }
        ]} />
    </div>

    <h1 class="text-2xl font-bold mb-4">Calendars</h1>

    <div class="auth-section mb-6 flex-shrink-0">
        {#if isPublicDemo}
            <div class="user-info bg-gray-50 p-3 rounded text-sm text-gray-700 border border-gray-200">
                Public demo / Guest access
            </div>
        {:else}
            <AuthComponent onAuthSuccess={handleAuthSuccess} onAuthLogout={handleAuthLogout} />
        {/if}
    </div>

    {#if isLoading}
        <div class="flex justify-center py-8">
            <Loader />
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
    {:else if calendars.length === 0}
        <p class="text-sm text-gray-500 italic" data-testid="project-calendar-list-empty">No calendars in this project yet.</p>
    {:else}
        <ul class="space-y-2" data-testid="project-calendar-list">
            {#each calendars as calendar (calendar.id)}
                <li>
                    <a
                        class="text-blue-600 hover:underline"
                        href={calendarHref(calendar.id)}
                        data-calendar-id={calendar.id}
                    >
                        {calendar.settings.name || "Untitled calendar"}
                    </a>
                </li>
            {/each}
        </ul>
    {/if}
</main>
