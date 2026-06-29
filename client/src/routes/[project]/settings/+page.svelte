<script lang="ts">
    import { goto } from "$app/navigation";
    import { getLogger } from "../../../lib/logger";
    const logger = getLogger("SettingsPage");
    import { resolvePath } from "../../../utils/pathUtils";
    import { page } from "$app/stores";
    import { onMount } from "svelte";
    import {
        exportProjectToMarkdown,
        exportProjectToOpml,
        importMarkdownIntoProject,
        importOpmlIntoProject,
    } from "../../../services";
    import { getYjsClientByProjectTitle } from "../../../services";
    import { yjsStore } from "../../../stores/yjsStore.svelte";

    import { store } from "../../../stores/store.svelte";
    import {
        createSnapshotClient,
        loadProjectSnapshot,
        snapshotToProject,
        snapshotToMarkdown,
        snapshotToOpml,
    } from "../../../lib/projectSnapshot";
    import type { Project, Items, Item } from "../../../schema/app-schema";
    import type { YjsClient } from "../../../yjs/YjsClient";

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
        if (!projectLooksLikePlaceholder(store.project)) return;
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
                    ) as unknown as YjsClient;
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

    onMount(async () => {
        // Ensure Yjs connection for the current project
        const projectName = $page.params.project;
        if (projectName) {
            try {
                const client = await getYjsClientByProjectTitle(projectName);
                if (client) {
                    yjsStore.yjsClient = client as unknown as import("../../../yjs/YjsClient").YjsClient;
                    project = client.getProject() as unknown as Project;
                }
            } catch (err) {
                logger.warn("SettingsPage: Failed to connect to Yjs", err);
            }
        }

        // Try to get project from yjsStore first, then from store if Yjs fails
        if (!project) {
            project = (yjsStore.yjsClient?.getProject() as unknown as Project ||
                store.project);
        }
        hydrateFromSnapshotIfNeeded();
    });

    async function doExport(format: "opml" | "markdown") {
        logger.debug("doExport: Function started, format:", format);

        hydrateFromSnapshotIfNeeded();

        let projectForExport =
            yjsStore.yjsClient?.getProject() || store.project;
        logger.debug("doExport: using project from store:", !!projectForExport);

        const projectName = $page.params.project as string | undefined;

        let exportContent: string | undefined;

        if (
            (!projectForExport ||
                projectLooksLikePlaceholder(projectForExport as unknown as Project)) &&
            projectName
        ) {
            const snapshot = loadProjectSnapshot(projectName);
            if (snapshot) {
                logger.debug(
                    "doExport: Hydrating project from snapshot for export",
                    { projectName },
                );
                projectForExport = snapshotToProject(snapshot);
                try {
                    store.project = projectForExport;
                } catch {}
            }
        }

        if (projectForExport) {
            exportContent =
                format === "opml"
                    ? exportProjectToOpml(projectForExport as unknown as Project)
                    : exportProjectToMarkdown(projectForExport as unknown as Project);
            logger.debug("doExport: Export content:", exportContent);
        }

        if (!hasMeaningfulContent(exportContent) && projectName) {
            const snapshot = loadProjectSnapshot(projectName);
            if (snapshot) {
                logger.debug("doExport: Using snapshot fallback for export", {
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
            logger.debug("doImport: No project available");
            return;
        }

        const projectName = $page.params.project as string | undefined;

        logger.debug("doImport: Starting import process");
        logger.debug("doImport: Import format:", importFormat);
        logger.debug("doImport: Import text:", importText);
        logger.debug("doImport: Project before import:", currentProject);
        logger.debug(
            "doImport: Project items before import:",
            currentProject.items?.length || 0,
        );

        if (importFormat === "opml") {
            logger.debug("doImport: Calling importOpmlIntoProject");
            importOpmlIntoProject(importText, currentProject as unknown as Project);
        } else {
            logger.debug("doImport: Calling importMarkdownIntoProject");
            importMarkdownIntoProject(importText, currentProject as unknown as Project);
        }

        logger.debug(
            "doImport: Project items after import:",
            currentProject.items?.length || 0,
        );
        if (currentProject.items && currentProject.items.length > 0) {
            const items = currentProject.items as unknown as Items;
            const firstPage = items.at ? items.at(0) : (items as unknown as Item[])[0];
            const text = firstPage
                ? typeof firstPage.text === "function"
                    ? (firstPage.text as unknown as () => string)()
                    : (firstPage.text?.toString?.() ??
                      String(firstPage.text ?? ""))
                : "";
            logger.debug("doImport: First page after import:", text);
        }

        // If we modified a Yjs-backed project, make sure the changes are reflected in the stores
        if (yjsProject) {
            logger.debug(
                "doImport: Using Yjs-connected project, updating stores",
            );
            yjsStore.yjsClient = yjsStore.yjsClient; // This triggers reactivity in yjsStore
            store.project = yjsProject as unknown as import("../../../schema/app-schema").Project;
        } else {
            // If no Yjs project was available, update as before
            logger.debug("doImport: No Yjs project, using fallback");
            store.project = currentProject as unknown as Project;
        }

        // Clear import text after successful import
        importText = "";

        logger.debug(
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
            const items = currentProject.items as unknown as Items;
            const firstPage = items.at ? items.at(0) : (items as unknown as Item[])[0];

            if (firstPage) {
                try {
                    store.currentPage = firstPage;
                } catch {}

                // Get text - handle both Yjs getter and plain property
                let pageName;
                try {
                    pageName =
                        typeof firstPage.text === "function"
                            ? (firstPage.text as unknown as () => string)()
                            : (firstPage.text?.toString?.() ??
                              String(firstPage.text ?? ""));
                } catch {
                    pageName = String(firstPage.text ?? "");
                }

                if (pageName) {
                    const encodedProject = encodeURIComponent(projectName ?? "");
                    const encodedPage = encodeURIComponent(pageName);
                    logger.debug(
                        `doImport: Navigating to /${encodedProject}/${encodedPage}`,
                    );
                    await goto(resolvePath(`/${encodedProject}/${encodedPage}`));
                } else {
                    logger.debug(
                        "doImport: First page has no title, cannot navigate",
                    );
                }
            } else {
                logger.debug(
                    "doImport: First page is undefined despite length > 0",
                );
            }
        } else {
            logger.debug("doImport: No pages found after import");
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
