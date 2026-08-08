<script lang="ts">
    import Loader from "../../../../components/Loader.svelte";
    import { page } from "$app/stores";
    import { onMount } from "svelte";
    import { userManager } from "../../../../auth/UserManager";
    import AuthComponent from "../../../../components/AuthComponent.svelte";
    import { getLogger } from "../../../../lib/logger";
    import { getYjsClientByProjectTitle } from "../../../../services";
    import { store } from "../../../../stores/store.svelte";
    import { yjsStore } from "../../../../stores/yjsStore.svelte";
    import Breadcrumb from "../../../../components/Breadcrumb.svelte";
    import CalendarView from "../../../../components/calendar/CalendarView.svelte";
    import { listCalendars } from "../../../../services/calendar/calendarService";
    import { isPublicProject } from "../../../../lib/publicProject";
    import { Project } from "$shared/app-schema";

    const logger = getLogger("CalendarStandalonePage");

    // URL params
    let projectName = $derived($page.params.project);
    let calendarName = $derived($page.params.calendar);

    // Page state
    let error: string | undefined = $state(undefined);
    let isAuthenticated = $state(false);
    let notFound = $state(false);
    let isLoading = $state(true);
    let calendarId: string | undefined = $state(undefined);
    let calendarProject: Project | undefined = $state(undefined);
    let calendarProjectId: string | undefined = $state(undefined);

    // Public projects stay readable for anonymous visitors. Deriving the gate
    // instead of folding the demo case into `isAuthenticated` keeps the auth
    // callbacks below from clobbering it once Firebase resolves to no user.
    let isPublicDemo = $derived(isPublicProject(projectName));
    let canAccess = $derived(isAuthenticated || isPublicDemo);

    async function handleAuthSuccess() {
        isAuthenticated = true;
    }

    function handleAuthLogout() {
        isAuthenticated = false;
    }

    async function loadCalendar() {
        if (!projectName || !calendarName || !canAccess) return;

        logger.info(`Loading standalone calendar: project="${projectName}", calendar="${calendarName}"`);
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

            const project = Project.fromDoc(store.project.ydoc);
            // The route carries the display name; falling back to the id
            // keeps links written against the identifier working too.
            const entry = listCalendars(project).find((e) => e.settings.name === calendarName)
                ?? listCalendars(project).find((e) => e.id === calendarName);
            if (!entry) {
                logger.warn(`Calendar "${calendarName}" not found in project "${projectName}"`);
                notFound = true;
                return;
            }

            calendarProject = project;
            calendarId = entry.id;
            calendarProjectId = yjsStore.currentProjectId ?? undefined;
        } catch (err) {
            logger.error({ error: err }, "Failed to load calendar page:");
            error = err instanceof Error ? err.message : "An error occurred while loading the calendar.";
        } finally {
            isLoading = false;
        }
    }

    $effect(() => {
        if (canAccess && projectName && calendarName) {
            loadCalendar();
        } else {
            isLoading = false;
        }
    });

    onMount(() => {
        isAuthenticated = userManager.getCurrentUser() !== null;
    });
</script>

<svelte:head>
    <title>{calendarName ? calendarName : "Calendar"} | Outliner</title>
</svelte:head>

<main class="w-full h-[calc(100vh-5rem)] max-w-7xl mx-auto px-4 py-8 md:px-8 flex flex-col">
    <div class="mb-4 flex-shrink-0">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: projectName || "Project", href: `/${encodeURIComponent(projectName)}` },
            { label: "Calendars" },
            { label: calendarName || "Calendar" }
        ]} />
    </div>
    <div class="mb-4 flex items-center flex-shrink-0">
        <h1 class="text-2xl font-bold">
            {calendarName || "Calendar"}
        </h1>
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
            <div class="flex flex-col items-center justify-center space-y-4" aria-busy="true" aria-live="polite" role="status">
                <Loader />
                <div class="text-gray-600 text-sm font-medium">Loading...</div>
            </div>
        </div>
    {:else if error}
        <div class="rounded-md bg-red-50 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-red-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-red-800">
                        An error occurred
                    </h3>
                    <div class="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                    </div>
                </div>
            </div>
        </div>
    {:else if notFound}
        <div class="rounded-md bg-yellow-50 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-yellow-400">⚠️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-yellow-800">
                        Calendar not found
                    </h3>
                    <div class="mt-2 text-sm text-yellow-700">
                        <p>
                            The specified calendar "{calendarName}" does not exist in project "{projectName}".
                        </p>
                    </div>
                </div>
            </div>
        </div>
    {:else if !canAccess}
        <div class="rounded-md bg-blue-50 p-4">
            <div class="flex">
                <div class="flex-shrink-0">
                    <span class="text-blue-400">ℹ️</span>
                </div>
                <div class="ml-3">
                    <h3 class="text-sm font-medium text-blue-800">
                        Login required
                    </h3>
                    <div class="mt-2 text-sm text-blue-700">
                        <p>
                            Please log in to view this calendar.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    {:else if calendarId && calendarProject}
        <div class="flex-grow min-h-0 relative border border-gray-200 rounded-md overflow-hidden bg-white p-2">
            {#key calendarId}
                <CalendarView project={calendarProject} projectId={calendarProjectId} {calendarId} />
            {/key}
        </div>
    {/if}
</main>
