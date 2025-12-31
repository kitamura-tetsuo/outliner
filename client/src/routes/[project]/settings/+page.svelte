<script lang="ts">
    import { goto } from "$app/navigation";
    import { resolve } from "$app/paths";
    import { page } from "$app/stores";
    import { onMount } from "svelte";
    import {
        exportProjectToMarkdown,
        exportProjectToOpml,
        importMarkdownIntoProject,
        importOpmlIntoProject,
    } from "../../../services";
    import { yjsStore } from "../../../stores/yjsStore.svelte";
    import { store } from "../../../stores/store.svelte";
    import {
        loadProjectSnapshot,
        saveProjectSnapshot,
        snapshotToProject,
        snapshotToMarkdown,
        snapshotToOpml,
        createSnapshotClient,
    } from "../../../lib/projectSnapshot";
    import type { Project, Items } from "../../../schema/app-schema";

    interface PlainTreeItem {
        text: string;
        children: PlainTreeItem[];
    }

    let project: Project | undefined = undefined;
    let exportText = $state("");
    let importText = $state("");
    let importFormat = $state("opml");

    function projectLooksLikePlaceholder(
        candidate: Project | undefined,
    ): boolean {
        if (!candidate) return true;
        try {
            const items = candidate.items;
            const length = items?.length ?? 0;
            if (length === 0) return true;
            if (length === 1) {
                const first = items.at(0);
                const text =
                    first?.text?.toString?.() ?? String(first?.text ?? "");
                const childLength = first?.items?.length ?? 0;
                if (text === "settings" && childLength === 0) return true;
            }
        } catch {}
        return false;
    }

    function hydrateFromSnapshotIfNeeded() {
        const projectName = $page.params.project as string | undefined;
        if (!projectName) return;
        if (!projectLooksLikePlaceholder(store.project as any)) return;
        const snapshot = loadProjectSnapshot(projectName);
        if (!snapshot) return;
        try {
            const hydrated = snapshotToProject(snapshot);
            store.project = hydrated;
            try {
                store.currentPage = undefined;
            } catch {}
            if (!yjsStore.yjsClient) {
                try {
                    yjsStore.yjsClient = createSnapshotClient(
                        projectName,
                        hydrated,
                    ) as any;
                } catch {}
            }
            project = hydrated;
        } catch {}
    }

    function hasMeaningfulContent(content: string | undefined): boolean {
        if (!content) return false;
        const trimmed = content.trim();
        if (!trimmed) return false;
        if (trimmed === "- settings") return false;
        return true;
    }

    onMount(() => {
        // Try to get project from yjsStore first, then from store
        project = (yjsStore.yjsClient?.getProject() || store.project) as any;
        hydrateFromSnapshotIfNeeded();
    });

    async function doExport(format: "opml" | "markdown") {
        console.log("doExport: Function started, format:", format);

        hydrateFromSnapshotIfNeeded();

        let projectForExport =
            yjsStore.yjsClient?.getProject() || store.project;
        console.log("doExport: using project from store:", !!projectForExport);

        const projectName = $page.params.project as string | undefined;

        let exportContent: string | undefined;

        if (
            (!projectForExport ||
                projectLooksLikePlaceholder(projectForExport as any)) &&
            projectName
        ) {
            const snapshot = loadProjectSnapshot(projectName);
            if (snapshot) {
                console.log(
                    "doExport: Hydrating project from snapshot for export",
                    { projectName },
                );
                projectForExport = snapshotToProject(snapshot) as any;
                try {
                    store.project = projectForExport as any;
                } catch {}
            }
        }

        if (projectForExport) {
            exportContent =
                format === "opml"
                    ? exportProjectToOpml(projectForExport as any)
                    : exportProjectToMarkdown(projectForExport as any);
            console.log("doExport: Export content:", exportContent);
        }

        if (!hasMeaningfulContent(exportContent) && projectName) {
            const snapshot = loadProjectSnapshot(projectName);
            if (snapshot) {
                console.log("doExport: Using snapshot fallback for export", {
                    projectName,
                });
                exportContent =
                    format === "opml"
                        ? snapshotToOpml(snapshot)
                        : snapshotToMarkdown(snapshot);
                if (!projectForExport) {
                    try {
                        store.project = snapshotToProject(snapshot);
                    } catch {}
                }
            }
        }

        exportText = exportContent ?? "";
    }

    async function doImport() {
        // First, ensure we're getting the Yjs-connected project
        const yjsProject = yjsStore.yjsClient?.getProject();
        const currentProject = yjsProject || store.project || project;

        if (!currentProject) {
            console.log("doImport: No project available");
            return;
        }

        const projectName = $page.params.project as string | undefined;

        console.log("doImport: Starting import process");
        console.log("doImport: Import format:", importFormat);
        console.log("doImport: Import text:", importText);
        console.log("doImport: Project before import:", currentProject);
        console.log(
            "doImport: Project items before import:",
            currentProject.items?.length || 0,
        );

        if (importFormat === "opml") {
            console.log("doImport: Calling importOpmlIntoProject");
            importOpmlIntoProject(importText, currentProject as any);
        } else {
            console.log("doImport: Calling importMarkdownIntoProject");
            importMarkdownIntoProject(importText, currentProject as any);
        }

        console.log(
            "doImport: Project items after import:",
            currentProject.items?.length || 0,
        );
        if (currentProject.items && currentProject.items.length > 0) {
            console.log(
                "doImport: First page after import:",
                (currentProject as any).items[0].text,
            );
        }

        // If we modified a Yjs-backed project, make sure the changes are reflected in the stores
        if (yjsProject) {
            console.log(
                "doImport: Using Yjs-connected project, updating stores",
            );
            yjsStore.yjsClient = yjsStore.yjsClient; // This triggers reactivity in yjsStore
            store.project = yjsProject as any;
        } else {
            // If no Yjs project was available, update as before
            console.log("doImport: No Yjs project, using fallback");
            store.project = currentProject as any;
        }

        // Clear import text after successful import
        importText = "";

        console.log(
            "doImport: Import completed, waiting for Yjs sync before navigation",
        );

        // Set the skip flag and keep it active during navigation
        try {
            window.localStorage?.setItem?.("SKIP_TEST_CONTAINER_SEED", "true");
        } catch {}

        // Wait for Yjs to sync the changes - increase timeout to ensure proper synchronization
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Navigate to the first imported page instead of reloading
        if (currentProject.items && currentProject.items.length > 0) {
            const firstPage = (currentProject as any).items[0];
            try {
                store.currentPage = firstPage;
            } catch {}
            const pageName = firstPage.text;
            console.log(`doImport: Navigating to /${projectName}/${pageName}`);
            await goto(`/${projectName}/${pageName}`);
        } else {
            console.log("doImport: No pages found after import");
        }
    }

    // Wrapper functions for the async event handlers
    function exportMarkdown() {
        doExport("markdown");
    }

    function exportOpml() {
        doExport("opml");
    }
</script>

<h2>Import / Export</h2>
<div class="export-section">
    <button onclick={exportOpml}>Export OPML</button>
    <button onclick={exportMarkdown}>Export Markdown</button>
    <textarea readonly bind:value={exportText} data-testid="export-output"
    ></textarea>
</div>
<div class="import-section">
    <select bind:value={importFormat} data-testid="import-format-select">
        <option value="opml">OPML</option>
        <option value="markdown">Markdown</option>
    </select>
    <textarea bind:value={importText} data-testid="import-input"></textarea>
    <button onclick={doImport}>Import</button>
</div>
