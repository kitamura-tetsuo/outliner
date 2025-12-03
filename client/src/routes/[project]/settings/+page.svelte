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
    renameProject,
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
let newProjectTitle = $state("");
let isRenaming = $state(false);
let renameError: string | undefined = $state(undefined);
let renameSuccess: string | undefined = $state(undefined);

function projectLooksLikePlaceholder(candidate: Project | undefined): boolean {
    if (!candidate) return true;
    try {
        const items = candidate.items;
        const length = items?.length ?? 0;
        if (length === 0) return true;
        if (length === 1) {
            const first = items.at(0);
            const text = first?.text?.toString?.() ?? String(first?.text ?? "");
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
                yjsStore.yjsClient = createSnapshotClient(projectName, hydrated);
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
    project = yjsStore.yjsClient?.getProject() || store.project;
    hydrateFromSnapshotIfNeeded();
    // Initialize the newProjectTitle with the current project title
    if (project) {
        newProjectTitle = project.title;
    }
});

// プロジェクト名を変更する関数
async function doRenameProject() {
    if (!project || !newProjectTitle.trim()) {
        renameError = "プロジェクト名を入力してください";
        return;
    }

    if (newProjectTitle === project.title) {
        renameError = "新しいプロジェクト名は現在名と異なります";
        return;
    }

    isRenaming = true;
    renameError = undefined;
    renameSuccess = undefined;

    try {
        // コンテナIDを取得（URLパラメータから）
        const containerId = $page.params.project;

        // プロジェクト名を更新
        const success = await renameProject(containerId, newProjectTitle);

        if (success) {
            // 成功時はローカルでもプロジェクト名を更新
            project.title = newProjectTitle;
            renameSuccess = `プロジェクト名が「${newProjectTitle}」に変更されました`;
        } else {
            renameError = "プロジェクト名の変更に失敗しました";
        }
    } catch (err) {
        renameError = err instanceof Error ? err.message : "プロジェクト名の変更中にエラーが発生しました";
    } finally {
        isRenaming = false;
    }
}


async function doExport(format: "opml" | "markdown") {
    console.log("doExport: Function started, format:", format);

    hydrateFromSnapshotIfNeeded();

    let projectForExport = yjsStore.yjsClient?.getProject() || store.project;
    console.log("doExport: using project from store:", !!projectForExport);

    const projectName = $page.params.project as string | undefined;

    let exportContent: string | undefined;

    if ((!projectForExport || projectLooksLikePlaceholder(projectForExport)) && projectName) {
        const snapshot = loadProjectSnapshot(projectName);
        if (snapshot) {
            console.log("doExport: Hydrating project from snapshot for export", { projectName });
            projectForExport = snapshotToProject(snapshot);
            try {
                store.project = projectForExport;
            } catch {}
        }
    }

    if (projectForExport) {
        exportContent = format === "opml"
            ? exportProjectToOpml(projectForExport)
            : exportProjectToMarkdown(projectForExport);
        console.log("doExport: Export content:", exportContent);
    }

    if (!hasMeaningfulContent(exportContent) && projectName) {
        const snapshot = loadProjectSnapshot(projectName);
        if (snapshot) {
            console.log("doExport: Using snapshot fallback for export", { projectName });
            exportContent = format === "opml"
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
    console.log("doImport: Project items before import:", currentProject.items?.length || 0);

    if (importFormat === "opml") {
        console.log("doImport: Calling importOpmlIntoProject");
        importOpmlIntoProject(importText, currentProject);
    }
    else {
        console.log("doImport: Calling importMarkdownIntoProject");
        importMarkdownIntoProject(importText, currentProject);
    }

    console.log("doImport: Project items after import:", currentProject.items?.length || 0);
    if (currentProject.items && currentProject.items.length > 0) {
        console.log("doImport: First page after import:", currentProject.items[0].text);
    }

    // If we modified a Yjs-backed project, make sure the changes are reflected in the stores
    if (yjsProject) {
        console.log("doImport: Using Yjs-connected project, updating stores");
        yjsStore.yjsClient = yjsStore.yjsClient; // This triggers reactivity in yjsStore
        store.project = yjsProject;
    } else {
        // If no Yjs project was available, update as before
        console.log("doImport: No Yjs project, using fallback");
        store.project = currentProject;
    }

    // Ensure snapshot storage reflects the imported tree for subsequent navigations
    try {
        saveProjectSnapshot(currentProject);
        const toPlain = (items: Items): PlainTreeItem[] => {
            if (!items) return [];
            const len = items.length ?? 0;
            const result: PlainTreeItem[] = [];
            for (let idx = 0; idx < len; idx++) {
                const node = items.at(idx);
                if (!node) continue;
                result.push({
                    text: node.text.toString(),
                    children: toPlain(node.items),
                });
            }
            return result;
        };
        const plainTree = toPlain(currentProject.items);
        try {
            interface WindowWithPendingImports extends Window {
                __PENDING_IMPORTS__?: Record<string, PlainTreeItem[]>;
            }
            const win = window as WindowWithPendingImports;
            if (!win.__PENDING_IMPORTS__) win.__PENDING_IMPORTS__ = {};
            win.__PENDING_IMPORTS__[projectName ?? "__untitled__"] = plainTree;
            console.log("doImport: Stored pending import in-memory", {
                projectName,
                rootCount: plainTree.length,
                keys: Object.keys(win.__PENDING_IMPORTS__),
            });
        } catch (pendingError) {
            console.log("doImport: Failed to store pending import in-memory", pendingError);
        }
        try {
            const key = `outliner:pending-import:${encodeURIComponent(projectName ?? "__untitled__")}`;
            const payload = JSON.stringify(plainTree);
            window.sessionStorage?.setItem(key, payload);
            window.localStorage?.setItem(key, payload);
        } catch {}
    } catch (error) {
        console.log("doImport: Failed to persist snapshot after import", error);
    }

    // Clear import text after successful import
    importText = "";

    console.log("doImport: Import completed, waiting for Yjs sync before navigation");

    // Set the skip flag and keep it active during navigation
    try {
        window.localStorage?.setItem?.("SKIP_TEST_CONTAINER_SEED", "true");
    } catch {}

    // Wait for Yjs to sync the changes - increase timeout to ensure proper synchronization
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Navigate to the first imported page instead of reloading
    if (currentProject.items && currentProject.items.length > 0) {
        const firstPage = currentProject.items[0];
        try {
            store.currentPage = firstPage;
        } catch {}
        const pageName = firstPage.text;
        console.log(`doImport: Navigating to /${projectName}/${pageName}`);
        await goto(resolve(`/${projectName}/${pageName}`));
    }
    else {
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

<h2>Project Settings</h2>
<div class="rename-section">
    <h3>Rename Project</h3>
    <div class="form-group">
        <label for="project-title" class="form-label">
            Project Title
        </label>
        <input
            type="text"
            id="project-title"
            bind:value={newProjectTitle}
            placeholder="Enter new project name"
            class="form-input"
            disabled={isRenaming}
            data-testid="project-title-input"
        />
        <button
            onclick={doRenameProject}
            disabled={isRenaming || !newProjectTitle.trim() || newProjectTitle === project?.title}
            class="form-button"
            data-testid="rename-project-button"
        >
            {#if isRenaming}
                <span class="spinner"></span> Renaming...
            {:else}
                Rename Project
            {/if}
        </button>
    </div>

    {#if renameError}
        <div class="error-message" role="alert" data-testid="rename-error">
            {renameError}
        </div>
    {/if}

    {#if renameSuccess}
        <div class="success-message" role="alert" data-testid="rename-success">
            {renameSuccess}
        </div>
    {/if}
</div>

<h2>Import / Export</h2>
<div class="export-section">
    <button onclick={exportOpml}>Export OPML</button>
    <button onclick={exportMarkdown}>Export Markdown</button>
    <textarea readonly bind:value={exportText} data-testid="export-output"></textarea>
</div>
<div class="import-section">
    <select bind:value={importFormat} data-testid="import-format-select">
        <option value="opml">OPML</option>
        <option value="markdown">Markdown</option>
    </select>
    <textarea bind:value={importText} data-testid="import-input"></textarea>
    <button onclick={doImport}>Import</button>
</div>

<style>
/* Project Rename Section */
.rename-section {
    background-color: #f9f9f9;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 24px;
}

.rename-section h3 {
    margin-top: 0;
    margin-bottom: 16px;
    font-size: 18px;
    color: #333;
}

.form-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.form-label {
    font-weight: 600;
    color: #555;
    margin-bottom: 4px;
}

.form-input {
    padding: 10px 12px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 14px;
    transition: border-color 0.2s;
}

.form-input:focus {
    outline: none;
    border-color: #4a90e2;
    box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2);
}

.form-input:disabled {
    background-color: #f5f5f5;
    color: #999;
    cursor: not-allowed;
}

.form-button {
    padding: 10px 16px;
    background-color: #4a90e2;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.2s;
    align-self: flex-start;
}

.form-button:hover:not(:disabled) {
    background-color: #357abd;
}

.form-button:disabled {
    background-color: #ccc;
    cursor: not-allowed;
}

.spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-right: 8px;
    vertical-align: middle;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.error-message {
    background-color: #ffe6e6;
    border-left: 4px solid #d32f2f;
    color: #d32f2f;
    padding: 12px;
    margin-top: 12px;
    border-radius: 4px;
    font-size: 14px;
}

.success-message {
    background-color: #e6f7e6;
    border-left: 4px solid #4caf50;
    color: #2e7d32;
    padding: 12px;
    margin-top: 12px;
    border-radius: 4px;
    font-size: 14px;
}

/* Import/Export Section */
.export-section,
.import-section {
    background-color: #f9f9f9;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 24px;
}

.export-section h3 {
    margin-top: 0;
    margin-bottom: 16px;
    font-size: 18px;
    color: #333;
}

.export-section button,
.import-section button {
    padding: 8px 16px;
    background-color: #4a90e2;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
    margin-right: 8px;
    margin-bottom: 8px;
}

.export-section button:hover,
.import-section button:hover {
    background-color: #357abd;
}

textarea {
    width: 100%;
    min-height: 150px;
    padding: 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-family: monospace;
    font-size: 13px;
    margin-top: 8px;
}

select {
    padding: 8px 12px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 14px;
    margin-bottom: 8px;
}
</style>
