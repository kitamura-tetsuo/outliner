<script lang="ts">
    // Project-management landing page: /:project/-.
    //
    // A lightweight navigation/index surface to the project-scoped management
    // tools, not a new data model (issue: "Unify project-scoped management
    // routes under /:project/-/...").
    import Breadcrumb from "../Breadcrumb.svelte";
    import { resolvePath } from "../../utils/pathUtils";
    import { isPublicProject, projectBasePath } from "../../lib/publicProject";
    import {
        projectCalendarsPath,
        projectGraphPath,
        projectGridsPath,
        projectImportExportPath,
        projectObjectsPath,
        projectSchedulesPath,
        projectSettingsPath,
        projectTablesPath,
    } from "../../lib/managementPaths";

    interface Props {
        projectName: string;
    }

    let { projectName }: Props = $props();

    let isDemo = $derived(isPublicProject(projectName));

    interface Tool {
        label: string;
        description: string;
        href: string;
    }

    // Project rename/sharing and OPML/Markdown import-export operate on the
    // project descriptor and local snapshot state, which the public demo has
    // neither of — those two tools stay out of the demo's landing page.
    let tools = $derived.by((): Tool[] => {
        const items: Tool[] = [
            { label: "Objects", description: "Browse, rename and delete Tables, Grids, Calendars and Schedules.", href: resolvePath(projectObjectsPath(projectName)) },
            { label: "Tables", description: "Structured data tables.", href: resolvePath(projectTablesPath(projectName)) },
            { label: "Grids", description: "Saved queries over your tables.", href: resolvePath(projectGridsPath(projectName)) },
            { label: "Calendars", description: "Calendar views over your data.", href: resolvePath(projectCalendarsPath(projectName)) },
            { label: "Schedules", description: "Scheduled SQL that runs on a recurring rule.", href: resolvePath(projectSchedulesPath(projectName)) },
            { label: "Graph", description: "The link graph between this project's pages.", href: resolvePath(projectGraphPath(projectName)) },
        ];
        if (!isDemo) {
            items.push(
                { label: "Import / Export", description: "Import or export this project as OPML or Markdown.", href: resolvePath(projectImportExportPath(projectName)) },
                { label: "Settings", description: "Project title and sharing.", href: resolvePath(projectSettingsPath(projectName)) },
            );
        }
        return items;
    });
</script>

<svelte:head>
    <title>{projectName} management | Outliner</title>
</svelte:head>

<main class="container mx-auto px-4 py-8 max-w-3xl">
    <div class="mb-4">
        <Breadcrumb items={[
            { label: "Home", href: "/" },
            { label: projectName, href: resolvePath(projectBasePath(projectName)) },
            { label: "Manage" }
        ]} />
    </div>

    <h1 class="text-2xl font-bold mb-6">
        <span class="text-gray-600">{projectName} /</span> Manage
    </h1>

    <ul class="grid grid-cols-1 sm:grid-cols-2 gap-4" data-testid="management-landing-tools">
        {#each tools as tool (tool.label)}
            <li>
                <a
                    href={tool.href}
                    class="block rounded-lg border border-gray-200 p-4 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                    data-testid={`management-landing-${tool.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                >
                    <div class="font-semibold text-gray-900">{tool.label}</div>
                    <div class="text-sm text-gray-500 mt-1">{tool.description}</div>
                </a>
            </li>
        {/each}
    </ul>
</main>
