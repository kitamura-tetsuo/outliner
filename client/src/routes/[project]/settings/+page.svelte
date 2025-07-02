<script lang="ts">
import { goto } from "$app/navigation";
import { page } from "$app/stores";
import { onMount } from "svelte";
import {
    exportProjectToMarkdown,
    exportProjectToOpml,
    importMarkdownIntoProject,
    importOpmlIntoProject,
} from "../../../services";
import { fluidStore } from "../../../stores/fluidStore.svelte";
import { store } from "../../../stores/store.svelte";

let project: any = undefined;
let exportText = $state("");
let importText = $state("");
let importFormat = $state("opml");

onMount(() => {
    project = fluidStore.fluidClient?.getProject();
});

function doExport(format: "opml" | "markdown") {
    if (!project) return;
    exportText = format === "opml"
        ? exportProjectToOpml(project)
        : exportProjectToMarkdown(project);
}

async function doImport() {
    if (!project) {
        console.log("doImport: No project available");
        return;
    }

    console.log("doImport: Starting import process");
    console.log("doImport: Import format:", importFormat);
    console.log("doImport: Import text:", importText);
    console.log("doImport: Project before import:", project);
    console.log("doImport: Project items before import:", project.items?.length || 0);

    if (importFormat === "opml") {
        console.log("doImport: Calling importOpmlIntoProject");
        importOpmlIntoProject(importText, project);
    }
    else {
        console.log("doImport: Calling importMarkdownIntoProject");
        importMarkdownIntoProject(importText, project);
    }

    console.log("doImport: Project items after import:", project.items?.length || 0);
    if (project.items && project.items.length > 0) {
        console.log("doImport: First page after import:", project.items[0].text);
    }

    // Reinitialize global store so new pages become accessible
    console.log("doImport: Reinitializing global store");
    store.project = project;

    // Clear import text after successful import
    importText = "";

    console.log("doImport: Import completed, navigating to first imported page");

    // Navigate to the first imported page instead of reloading
    if (project.items && project.items.length > 0) {
        const firstPage = project.items[0];
        const projectName = $page.params.project;
        const pageName = firstPage.text;
        console.log(`doImport: Navigating to /${projectName}/${pageName}`);
        await goto(`/${projectName}/${pageName}`);
    }
    else {
        console.log("doImport: No pages found after import");
    }
}
</script>

<h2>Import / Export</h2>
<div class="export-section">
    <button on:click={() => doExport("opml")}>Export OPML</button>
    <button on:click={() => doExport("markdown")}>Export Markdown</button>
    <textarea readonly bind:value={exportText} data-testid="export-output"></textarea>
</div>
<div class="import-section">
    <select bind:value={importFormat} data-testid="import-format-select">
        <option value="opml">OPML</option>
        <option value="markdown">Markdown</option>
    </select>
    <textarea bind:value={importText} data-testid="import-input"></textarea>
    <button on:click={doImport}>Import</button>
</div>
