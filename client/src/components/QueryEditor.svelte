<script lang="ts">
type Props = {
    query?: string;
    onrun?: (data: { query: string; }) => void;
};
let { query = "", onrun }: Props = $props();

function run() {
    if (onrun) onrun({ query });
}
</script>

<div class="query-editor">
    <textarea bind:value={query} class="border w-full h-24"></textarea>
    <button onclick={run} class="mt-2 px-2 py-1 bg-blue-500 text-white">Run</button>
</div>
