<script lang="ts">
import { onMount } from "svelte";
import { fluidStore } from "../../../stores/fluidStore.svelte";
import { store } from "../../../stores/store.svelte";
import {
    exportProjectToMarkdown,
    exportProjectToOpml,
    importMarkdownIntoProject,
    importOpmlIntoProject,
} from "../../../services";

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

function doImport() {
    if (!project) return;
    if (importFormat === "opml") {
        importOpmlIntoProject(importText, project);
    } else {
        importMarkdownIntoProject(importText, project);
    }
    // Reinitialize global store so new pages become accessible
    store.project = project;
}
</script>

<h2>Import / Export</h2>
<div class="export-section">
    <button on:click={() => doExport('opml')}>Export OPML</button>
    <button on:click={() => doExport('markdown')}>Export Markdown</button>
    <textarea readonly bind:value={exportText} data-testid="export-output"></textarea>
</div>
<div class="import-section">
    <select bind:value={importFormat}>
        <option value="opml">OPML</option>
        <option value="markdown">Markdown</option>
    </select>
    <textarea bind:value={importText} data-testid="import-input"></textarea>
    <button on:click={doImport}>Import</button>
</div>
