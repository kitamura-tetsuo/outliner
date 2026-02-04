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
    
    // Log component state for debugging
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
    <ul role="listbox" aria-label="Command suggestions">
        {#each currentVisible as cmd, i (cmd.type)}
            <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
            <li
                role="option"
                aria-selected={i === commandPaletteStore.selectedIndex}
                class:selected={i === commandPaletteStore.selectedIndex}
                id="command-item-{cmd.type}"
                data-testid="command-item-{cmd.type}"
                tabindex="-1"
                onclick={() => handleClick(cmd.type)}
                onkeydown={(e) => e.key === 'Enter' && handleClick(cmd.type)}
            >
                {cmd.label}
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
.slash-command-palette li {
    display:block;
    width:100%;
    padding:4px 8px;
    text-align:left;
    cursor: pointer;
}
.slash-command-palette li.selected {
    background:#eee;
}

/* Debug style - always show */
.debug-show {
    display: block !important;
    border: 2px solid red;
}
</style>
