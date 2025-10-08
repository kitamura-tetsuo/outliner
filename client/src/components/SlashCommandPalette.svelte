<script lang="ts">
import { commandPaletteStore } from "../stores/CommandPaletteStore.svelte";

function handleClick(type: "table" | "chart" | "alias") {
    commandPaletteStore.insert(type);
    commandPaletteStore.hide();
}

// Create reactive variables that update when the store values change
let currentVisible = $state(commandPaletteStore.visible);
let currentQuery = $state(commandPaletteStore.query);

// Watch for changes in the store and update our reactive state
$effect(() => {
    // This effect runs when commandPaletteStore.visible changes
    const visible = commandPaletteStore.visible;
    const query = commandPaletteStore.query;
    
    currentVisible = [...visible]; // Create a new array to ensure reactivity
    currentQuery = query;
    
    // デバッグ用にコンポーネントの状態をログ出力
    try {
        console.log('[SlashCommandPalette] isVisible:', commandPaletteStore.isVisible);
        console.log('[SlashCommandPalette] visible length:', visible.length);
        console.log('[SlashCommandPalette] visible items:', visible.map(c => c.label));
        console.log('[SlashCommandPalette] query:', query);
        console.log('[SlashCommandPalette] filtered:', commandPaletteStore.filtered.map(c => c.label));
    } catch {}
});
</script>

<div
    class="slash-command-palette"
    class:debug-show={!commandPaletteStore.isVisible}
    data-is-visible={commandPaletteStore.isVisible}
    data-query={currentQuery}
    data-visible-count={currentVisible.length}
    style={`position:absolute;top:${commandPaletteStore.position.top}px;left:${commandPaletteStore.position.left}px;z-index:1000;display:${commandPaletteStore.isVisible ? 'block' : 'none'};`}
>
    <ul>
        {#each currentVisible as cmd, i (cmd.type)}
            <li class:selected={i === commandPaletteStore.selectedIndex} data-testid="command-item-{cmd.type}">
                <button type="button" onclick={() => handleClick(cmd.type)}>{cmd.label}</button>
            </li>
        {/each}
    </ul>
</div>

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

/* デバッグ用のスタイル - 常に表示 */
.debug-show {
    display: block !important;
    border: 2px solid red;
}
</style>
