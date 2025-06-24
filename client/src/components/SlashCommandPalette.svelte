<script lang="ts">
import { commandPaletteStore } from "../stores/CommandPaletteStore.svelte";

function select(type: "table" | "chart") {
    commandPaletteStore.insert(type);
    commandPaletteStore.hide();
}
</script>

{#if commandPaletteStore.isVisible}
<div class="slash-command-palette" style="top:{commandPaletteStore.position.top}px;left:{commandPaletteStore.position.left}px;position:absolute;z-index:1000;background:white;border:1px solid #ccc;border-radius:4px;padding:4px;">
    <ul>
        <li><button on:click={() => select('table')}>Table</button></li>
        <li><button on:click={() => select('chart')}>Chart</button></li>
    </ul>
</div>
{/if}

<style>
.slash-command-palette ul {
    list-style:none;
    margin:0;
    padding:0;
}
.slash-command-palette li button {
    display:block;
    width:100%;
    padding:4px 8px;
    text-align:left;
}
</style>
