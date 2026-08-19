<script lang="ts">
    import { onMount } from "svelte";
    import type { CalendarEntry } from "../../services/calendar/calendarEntries";

    interface Props {
        x: number;
        y: number;
        entry: CalendarEntry;
        isDeletable: (entry: CalendarEntry) => boolean;
        onClose: () => void;
        onDeleteRequest: (entry: CalendarEntry) => void;
    }

    let { x, y, entry, isDeletable, onClose, onDeleteRequest }: Props = $props();
    // svelte-ignore state_referenced_locally
    let menuX = $state(x);
    // svelte-ignore state_referenced_locally
    let menuY = $state(y);
    let menuRef: HTMLDivElement;
    let previousFocus: HTMLElement | null = null;
    let activeIndex = $state(0);

    onMount(() => {
        previousFocus = document.activeElement as HTMLElement | null;

        if (menuRef) {
            const rect = menuRef.getBoundingClientRect();
            if (menuX + rect.width > window.innerWidth) {
                menuX = window.innerWidth - rect.width - 10;
            }
            if (menuY + rect.height > window.innerHeight) {
                menuY = window.innerHeight - rect.height - 10;
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
    class="context-menu calendar-context-menu"
    style="left: {menuX}px; top: {menuY}px;"
    role="menu"
    aria-label="Event Actions"
>
    {#if isDeletable(entry)}
        <button type="button" data-testid="calendar-context-menu-delete" role="menuitem" class="delete-btn" tabindex={activeIndex === 0 ? 0 : -1} onclick={() => { onDeleteRequest(entry); handleClose(); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Delete
        </button>
    {:else}
        <div class="empty-message">No actions available</div>
    {/if}
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
    min-width: 150px;
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

.context-menu button.delete-btn {
    color: #ef4444;
}

.context-menu button.delete-btn:hover,
.context-menu button.delete-btn:focus-visible {
    background-color: #fef2f2;
}

.empty-message {
    padding: 8px 12px;
    font-size: 0.875rem;
    color: #9ca3af;
    text-align: center;
}
</style>
