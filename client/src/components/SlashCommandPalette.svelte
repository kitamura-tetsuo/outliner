<script lang="ts">
import { commandPaletteStore } from "../stores/CommandPaletteStore.svelte";

function handleClick(type: "table" | "chart" | "alias") {
    commandPaletteStore.insert(type);
    commandPaletteStore.hide();
}
</script>

{#if commandPaletteStore.isVisible}
<div
    class="slash-command-palette"
    style="position:absolute;top:{commandPaletteStore.position.top}px;left:{commandPaletteStore.position.left}px;z-index:1000;"
>
    <ul>
        {#each commandPaletteStore.filtered as cmd, i}
            <li class:selected={i === commandPaletteStore.selectedIndex}>
                <button on:click={() => handleClick(cmd.type)}>{cmd.label}</button>
            </li>
        {/each}
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
.slash-command-palette li.selected {
    background:#eee;
}
</style>
