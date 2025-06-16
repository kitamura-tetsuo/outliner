<script lang="ts">
import { createEventDispatcher } from 'svelte';

type Props = { query?: string };
let { query = '' }: Props = $props();
const dispatch = createEventDispatcher();

function run() {
    dispatch('run', { query });
}
</script>

<div class="query-editor">
    <textarea bind:value={query} class="border w-full h-24"></textarea>
    <button on:click={run} class="mt-2 px-2 py-1 bg-blue-500 text-white">Run</button>
</div>
