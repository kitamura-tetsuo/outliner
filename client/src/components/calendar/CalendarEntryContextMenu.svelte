<script lang="ts">
import { onMount } from "svelte";
interface Props { x: number; y: number; entryTitle: string; returnFocus?: HTMLElement; onDelete: () => void; onClose: () => void; }
let { x, y, entryTitle, returnFocus, onDelete, onClose }: Props = $props();
let menu: HTMLDivElement;
function close() { onClose(); queueMicrotask(() => returnFocus?.focus()); }
function chooseDelete() { onDelete(); onClose(); }
function onKeydown(event: KeyboardEvent) { if (event.key === "Escape") { event.preventDefault(); close(); } }
onMount(() => {
    const rect = menu.getBoundingClientRect();
    x = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
    y = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
    menu.querySelector("button")?.focus();
});
</script>
<svelte:window onkeydown={onKeydown} />
<div class="overlay" role="presentation" onclick={close} oncontextmenu={(event) => { event.preventDefault(); close(); }}></div>
<div bind:this={menu} class="calendar-entry-context-menu" data-testid="calendar-entry-context-menu" style={`left: ${x}px; top: ${y}px`} role="menu" aria-label={`Actions for ${entryTitle}`}>
    <button type="button" role="menuitem" data-testid="calendar-entry-context-delete" onclick={chooseDelete}>Delete</button>
</div>
<style>
.overlay { position: fixed; inset: 0; z-index: 1100; }
.calendar-entry-context-menu { position: fixed; z-index: 1101; min-width: 150px; padding: 4px 0; border: 1px solid #e5e7eb; border-radius: 6px; background: white; box-shadow: 0 4px 12px rgb(0 0 0 / 15%); }
button { width: 100%; padding: 7px 12px; border: 0; background: transparent; color: #b91c1c; text-align: left; cursor: pointer; }
button:hover, button:focus { background: #f3f4f6; outline: none; }
</style>
