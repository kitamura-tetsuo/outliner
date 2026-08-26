<script lang="ts">
    import { onMount } from "svelte";

    interface Props {
        x: number;
        y: number;
        visualTypes: string[];
        onClose: () => void;
        onAction: (action: string) => void;
    }

    let { x, y, visualTypes, onClose, onAction }: Props = $props();
    let menuRef: HTMLDivElement;
    let previousFocus: HTMLElement | null = null;
    let activeIndex = $state(0);

    onMount(() => {
        previousFocus = document.activeElement as HTMLElement | null;

        if (menuRef) {
            const rect = menuRef.getBoundingClientRect();
            if (x + rect.width > window.innerWidth) {
                x = window.innerWidth - rect.width - 10;
            }
            if (y + rect.height > window.innerHeight) {
                y = window.innerHeight - rect.height - 10;
            }
        }

        queueMicrotask(() => {
            const firstButton = menuRef?.querySelector("button");
            if (firstButton) firstButton.focus();
        });
    });

    function handleClose() {
        previousFocus?.focus();
        onClose();
    }

    function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            handleClose();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
            event.preventDefault();
            const buttons = Array.from(menuRef?.querySelectorAll("button") || []);
            const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (currentIndex > -1) {
                let nextIndex = currentIndex;
                if (event.key === "ArrowDown") {
                    nextIndex = (currentIndex + 1) % buttons.length;
                } else if (event.key === "ArrowUp") {
                    nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
                } else if (event.key === "Home") {
                    nextIndex = 0;
                } else if (event.key === "End") {
                    nextIndex = buttons.length - 1;
                }
                activeIndex = nextIndex;
                buttons[nextIndex].focus();
            } else if (buttons.length > 0) {
                activeIndex = 0;
                buttons[0].focus();
            }
        }
    }
</script>

<svelte:window on:keydown={handleKeyDown} />

<div class="context-menu-overlay" role="presentation" onclick={handleClose} oncontextmenu={(e) => { e.preventDefault(); handleClose(); }}></div>

<div
    bind:this={menuRef}
    class="context-menu"
    style="left: {x}px; top: {y}px;"
    role="menu"
    aria-label="Layout Actions"
>
    {#each visualTypes as t, i (t)}
        <button type="button" role="menuitem" tabindex={activeIndex === i ? 0 : -1} onclick={() => { onAction(t); handleClose(); }}>
            {#if t === 'yjstable'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                Add Grid
            {:else if t === 'calendar'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                Add Calendar
            {:else}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                Add {t}
            {/if}
        </button>
    {/each}
</div>

<style>
.context-menu-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 1000;
}

.context-menu {
    position: fixed;
    z-index: 1001;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    padding: 4px 0;
    min-width: 180px;
    display: flex;
    flex-direction: column;
}

.context-menu button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    background: none;
    border: none;
    text-align: left;
    font-size: 0.875rem;
    color: #374151;
    cursor: pointer;
}

.context-menu button:hover,
.context-menu button:focus-visible {
    background-color: #f3f4f6;
    outline: none;
}
</style>
