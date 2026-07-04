<script lang="ts">
import { commandPaletteStore } from "../stores/CommandPaletteStore.svelte";

function handleClick(type: "table" | "chart" | "alias") {
    commandPaletteStore.insert(type);
    commandPaletteStore.hide();
}

</script>

<div
    class="slash-command-palette"
    data-is-visible={commandPaletteStore.isVisible}
    data-query={commandPaletteStore.query}
    data-visible-count={commandPaletteStore.visible.length}
    style={`position:absolute;top:${commandPaletteStore.position.top}px;left:${commandPaletteStore.position.left}px;z-index:1000;display:${commandPaletteStore.isVisible ? 'block' : 'none'};`}
>
    <ul role="listbox" aria-label="Command suggestions">
        {#each commandPaletteStore.visible as cmd, i (cmd.type)}
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
</style>
