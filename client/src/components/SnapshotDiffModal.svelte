<script lang="ts">
import DiffMatchPatch from "diff-match-patch";
import { onMount } from "svelte";
import {
    addSnapshot,
    getSnapshot,
    listSnapshots,
    replaceWithSnapshot,
    type Snapshot,
} from "../services";

interface Props {
    project: string;
    page: string;
    currentContent: string;
    author: string;
}
let { project, page, currentContent = $bindable(), author }: Props = $props();

let snapshots = $state<Snapshot[]>([]);
let selectedId = $state("");
let compareTargetId = $state("current"); // "current", "previous", or specific snapshot id
let viewMode = $state<"inline" | "side-by-side">("side-by-side");

let inlineDiffHtml = $state("");
let leftDiffHtml = $state("");
let rightDiffHtml = $state("");
let leftPaneTitle = $state("");
let rightPaneTitle = $state("");

const dmp = new DiffMatchPatch();

function refresh() {
    snapshots = listSnapshots(project, page).sort((a, b) => b.timestamp - a.timestamp); // Ensure descending order
}

function showDiff(id: string) {
    if (id) selectedId = id;
    if (!selectedId) return;

    const snapshot = getSnapshot(project, page, selectedId);
    if (!snapshot) return;

    let targetContent = currentContent;
    let targetTitle = "Current";
    let baseTitle = new Date(snapshot.timestamp).toLocaleString();

    let isReversed = false;

    if (compareTargetId === "current") {
        targetContent = currentContent;
        targetTitle = "Current";
    } else if (compareTargetId === "previous") {
        const sorted = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
        const idx = sorted.findIndex(s => s.id === selectedId);
        if (idx > 0) {
            const prev = sorted[idx - 1];
            targetContent = prev.content;
            targetTitle = new Date(prev.timestamp).toLocaleString();
        } else {
            // No previous snapshot, compare with empty
            targetContent = "";
            targetTitle = "None (Oldest)";
        }
    } else {
        const targetSnap = getSnapshot(project, page, compareTargetId);
        if (targetSnap) {
            targetContent = targetSnap.content;
            targetTitle = new Date(targetSnap.timestamp).toLocaleString();

            // If target snapshot is older than selected snapshot, swap to make left older, right newer
            if (targetSnap.timestamp < snapshot.timestamp) {
                isReversed = true;
            }
        }
    }

    let oldContent = snapshot.content;
    let newContent = targetContent;

    // Default: left = selected, right = target
    leftPaneTitle = baseTitle;
    rightPaneTitle = targetTitle;

    if (isReversed) {
        oldContent = targetContent;
        newContent = snapshot.content;
        leftPaneTitle = targetTitle;
        rightPaneTitle = baseTitle;
    } else if (compareTargetId === "current" || compareTargetId === "previous") {
        // usually selected snapshot is older than "current"
        // if comparing with "previous", selected snapshot is newer than "previous"
        if (compareTargetId === "previous") {
            oldContent = targetContent;
            newContent = snapshot.content;
            leftPaneTitle = targetTitle;
            rightPaneTitle = baseTitle;
        }
    }

    const diff = dmp.diff_main(oldContent, newContent);
    dmp.diff_cleanupSemantic(diff);

    inlineDiffHtml = dmp.diff_prettyHtml(diff);

    let leftHtml = "";
    let rightHtml = "";

    for (const [op, text] of diff) {
        // Escape HTML
        const escapedText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
        if (op === 0) {
            leftHtml += `<span>${escapedText}</span>`;
            rightHtml += `<span>${escapedText}</span>`;
        } else if (op === -1) {
            leftHtml += `<del>${escapedText}</del>`;
        } else if (op === 1) {
            rightHtml += `<ins>${escapedText}</ins>`;
        }
    }

    leftDiffHtml = leftHtml;
    rightDiffHtml = rightHtml;
}

function revert() {
    if (!selectedId) return;
    const snap = replaceWithSnapshot(project, page, selectedId);
    if (snap) {
        currentContent = snap.content;
        refresh();
        showDiff(selectedId);
    }
}

onMount(() => {
    refresh();
});

$effect(() => {
    if (project && page) refresh();
});

$effect(() => {
    if (selectedId && compareTargetId) {
        showDiff(selectedId);
    }
});
</script>

<div class="bg-white rounded shadow-lg p-4 flex flex-col h-[80vh]">
    <h2 class="text-lg font-bold mb-2 flex-shrink-0" id="diff-modal-title">History / Diff</h2>

    <div class="flex gap-4 flex-1 min-h-0">
        <div class="w-1/3 border-r overflow-hidden flex flex-col">
            <h3 class="visually-hidden" id="snapshot-list-label">Snapshots</h3>
            <ul
                class="overflow-y-auto flex-1 pr-2 space-y-1"
                aria-labelledby="snapshot-list-label"
            >
                {#if snapshots.length === 0}
                    <li class="text-gray-500 italic p-2" role="status">No snapshots available</li>
                {/if}

                {#each snapshots as s (s.id)}
                    {@const isSelected = selectedId === s.id}
                    <li>
                        <button
                            type="button"
                            aria-pressed={isSelected}
                            class="w-full text-left p-2 rounded text-sm transition-colors duration-200 {isSelected ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600' : 'hover:bg-gray-100'}"
                            onclick={() => showDiff(s.id)}
                        >
                            <span class="block font-medium">
                                {new Date(s.timestamp).toLocaleString()}
                            </span>
                            <span class="block text-xs text-gray-500">
                                {s.author}
                            </span>
                        </button>
                    </li>
                {/each}
            </ul>
        </div>

        <div class="flex-1 flex flex-col overflow-hidden gap-2">
            {#if selectedId}
            <div class="flex justify-between items-center bg-gray-100 p-2 rounded text-sm flex-shrink-0">
                <div class="flex items-center gap-2">
                    <label for="compare-target" class="font-medium text-gray-700">Compare with:</label>
                    <select
                        id="compare-target"
                        bind:value={compareTargetId}
                        class="border-gray-300 rounded shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50 text-sm py-1 px-2"
                        disabled={!selectedId}
                    >
                        <option value="current">Current</option>
                        <option value="previous">Previous</option>
                        <optgroup label="Specific Snapshot">
                            {#each snapshots as s (s.id)}
                                {#if s.id !== selectedId}
                                    <option value={s.id}>{new Date(s.timestamp).toLocaleString()}</option>
                                {/if}
                            {/each}
                        </optgroup>
                    </select>
                </div>

                <div class="flex items-center gap-2">
                    <label for="view-mode" class="font-medium text-gray-700">View mode:</label>
                    <select
                        id="view-mode"
                        bind:value={viewMode}
                        class="border-gray-300 rounded shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50 text-sm py-1 px-2"
                    >
                        <option value="inline">Inline</option>
                        <option value="side-by-side">Side-by-side</option>
                    </select>
                </div>
            </div>
            {/if}

            <h3 class="visually-hidden">Diff View</h3>

            <div class="flex-1 overflow-hidden flex flex-col diff-container min-h-0">
                {#if !selectedId}
                    <div class="flex items-center justify-center h-full text-gray-400 italic bg-gray-50 rounded border border-gray-200">
                        Select a snapshot to view differences
                    </div>
                {:else if viewMode === 'inline'}
                    <!-- Added .diff class for backward compatibility with existing tests -->
                    <div
                        class="diff diff-view flex-1 overflow-auto bg-gray-50 p-3 rounded border border-gray-200 font-mono text-sm whitespace-pre-wrap break-words"
                        tabindex="0"
                        role="region"
                        aria-label="Inline diff content"
                    >
                        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                        {@html inlineDiffHtml}
                    </div>
                {:else}
                    <div class="flex-1 flex gap-2 overflow-hidden h-full">
                        <div class="flex-1 flex flex-col border border-gray-200 rounded overflow-hidden">
                            <div class="bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 border-b border-gray-200 flex-shrink-0 truncate" title={leftPaneTitle}>
                                {leftPaneTitle}
                            </div>
                            <div
                                class="diff diff-view flex-1 overflow-auto bg-red-50 p-3 font-mono text-sm whitespace-pre-wrap break-words"
                                tabindex="0"
                                role="region"
                                aria-label="Old diff content"
                            >
                                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                                {@html leftDiffHtml}
                            </div>
                        </div>
                        <div class="flex-1 flex flex-col border border-gray-200 rounded overflow-hidden">
                            <div class="bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 border-b border-gray-200 flex-shrink-0 truncate" title={rightPaneTitle}>
                                {rightPaneTitle}
                            </div>
                            <div
                                class="diff diff-view flex-1 overflow-auto bg-green-50 p-3 font-mono text-sm whitespace-pre-wrap break-words"
                                tabindex="0"
                                role="region"
                                aria-label="New diff content"
                            >
                                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                                {@html rightDiffHtml}
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <div class="mt-4 flex justify-end space-x-2 flex-shrink-0">
        <button
            class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors text-sm font-medium"
            onclick={() => {
                addSnapshot(project, page, currentContent, author);
                refresh();
            }}
        >
            Add Snapshot
        </button>
        <button
            class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            onclick={revert}
            disabled={!selectedId}
            aria-disabled={!selectedId}
            title={!selectedId ? "Select a snapshot first" : "Revert to selected snapshot"}
        >
            Revert
        </button>
    </div>
</div>

<style>
/* Using utility class pattern for visually hidden content */
.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

/* Diff styles */
:global(.diff-view ins) {
    background-color: #dcfce7;
    color: #166534;
    text-decoration: none;
    padding: 0 0.125rem;
    border-radius: 0.125rem;
}

:global(.diff-view del) {
    background-color: #fee2e2;
    color: #991b1b;
    text-decoration: line-through;
    opacity: 0.8;
    padding: 0 0.125rem;
    border-radius: 0.125rem;
}
</style>
