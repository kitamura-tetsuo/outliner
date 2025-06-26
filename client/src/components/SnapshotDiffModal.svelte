<script lang="ts">
  import { onMount } from "svelte";
  import {
    addSnapshot,
    listSnapshots,
    getSnapshot,
    replaceWithSnapshot,
    type Snapshot,
  } from "../services";
  import DiffMatchPatch from "diff-match-patch";

  interface Props {
    project: string;
    page: string;
    currentContent: string;
    author: string;
  }
  let { project, page, currentContent, author }: Props = $props();

  let snapshots = $state<Snapshot[]>([]);
  let selectedId = $state("");
  let diffHtml = $state("");
  const dmp = new DiffMatchPatch();

  function refresh() {
    snapshots = listSnapshots(project, page);
  }

  function showDiff(id: string) {
    selectedId = id;
    const snapshot = getSnapshot(project, page, id);
    if (!snapshot) return;
    const diff = dmp.diff_main(snapshot.content, currentContent);
    dmp.diff_cleanupSemantic(diff);
    diffHtml = dmp.diff_prettyHtml(diff);
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
</script>

<div class="p-4 bg-white rounded shadow-lg">
  <h2 class="text-lg font-bold mb-2">History / Diff</h2>
  <div class="flex">
    <ul class="w-1/3 pr-4 overflow-y-auto max-h-60 border-r">
      {#each snapshots as s}
        <li
          class="cursor-pointer hover:bg-gray-200 p-1"
          on:click={() => showDiff(s.id)}
        >
          {new Date(s.timestamp).toLocaleString()} - {s.author}
        </li>
      {/each}
    </ul>
    <div class="flex-1 pl-4">
      {@html diffHtml}
    </div>
  </div>
  <div class="mt-4 flex justify-end space-x-2">
    <button
      class="bg-gray-300 px-3 py-1 rounded"
      on:click={() => {
        addSnapshot(project, page, currentContent, author);
        refresh();
      }}
      >Add Snapshot</button
    >
    <button
      class="bg-blue-500 text-white px-3 py-1 rounded"
      on:click={revert}
      disabled={!selectedId}>Revert</button
    >
  </div>
</div>

<style>
  .diff ins {
    background-color: #e6ffe6;
    text-decoration: none;
  }
  .diff del {
    background-color: #ffe6e6;
  }
</style>
