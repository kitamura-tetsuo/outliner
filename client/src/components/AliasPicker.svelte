<script lang="ts">
import { aliasPickerStore } from "../stores/AliasPickerStore.svelte";

let filteredOptions = $state<{ path: string }[]>([]);
$effect(() => {
    const q = aliasPickerStore.query.toLowerCase();
    filteredOptions = aliasPickerStore.options.filter((o) =>
        o.path.toLowerCase().includes(q),
    );
});
function confirm(path: string) {
    aliasPickerStore.confirm(path);
}
</script>
{#if aliasPickerStore.isVisible}
<div class="alias-picker">
    <input type="text" bind:value={aliasPickerStore.query} placeholder="Select item" />
    <ul>
        {#each filteredOptions as opt}
            <li>
                <button data-id={opt.id} on:click={() => confirm(opt.path)}>{opt.path}</button>
            </li>
        {/each}
    </ul>
</div>
{/if}
<style>
.alias-picker {
    position: fixed;
    top: 20%;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    border: 1px solid #ccc;
    padding: 8px;
    z-index: 1000;
    max-height: 300px;
    overflow: auto;
}
.alias-picker ul { list-style: none; margin:0; padding:0; max-height:200px; overflow:auto; }
.alias-picker li button { display:block; width:100%; text-align:left; padding:4px; }
</style>
