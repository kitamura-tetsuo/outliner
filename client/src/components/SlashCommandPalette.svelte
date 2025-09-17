<script lang="ts">
import { commandPaletteStore } from "../stores/CommandPaletteStore.svelte";

function handleClick(type: "table" | "chart" | "alias") {
    commandPaletteStore.insert(type);
    commandPaletteStore.hide();
}

// デバッグ用にコンポーネントの状態をログ出力
$effect(() => {
    try {
        console.log('[SlashCommandPalette] isVisible:', commandPaletteStore.isVisible);
        console.log('[SlashCommandPalette] visible length:', commandPaletteStore.visible.length);
        console.log('[SlashCommandPalette] visible items:', commandPaletteStore.visible.map(c => c.label));
        console.log('[SlashCommandPalette] query:', commandPaletteStore.query);
        console.log('[SlashCommandPalette] filtered:', commandPaletteStore.filtered.map(c => c.label));
    } catch {}
});
</script>

<div
    class="slash-command-palette"
    class:debug-show={!commandPaletteStore.isVisible}
    data-is-visible={commandPaletteStore.isVisible}
    data-query={commandPaletteStore.query}
    data-visible-count={commandPaletteStore.visible.length}
    style="position:absolute;top:{commandPaletteStore.position.top}px;left:{commandPaletteStore.position.left}px;z-index:1000;display:{commandPaletteStore.isVisible ? 'block' : 'none'};"
>
    <ul>
        {#each commandPaletteStore.visible as cmd, i}
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
