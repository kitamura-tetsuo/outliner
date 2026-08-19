<script lang="ts">
    import { onMount } from "svelte";

    interface Props {
        x: number;
        y: number;
        voted: boolean;
        isCommentsVisible: boolean;
        componentType: string;
        /** False when this item's children are not all eligible Layout blocks. */
        canBecomeLayout?: boolean;
        onClose: () => void;
        onAction: (action: string) => void;
    }

    let { x, y, voted, isCommentsVisible, componentType, canBecomeLayout = true, onClose, onAction }: Props = $props();
    let menuRef: HTMLDivElement;
    let previousFocus: HTMLElement | null = null;
    let activeIndex = $state(0);

    onMount(() => {
        // Capture the currently focused element
        previousFocus = document.activeElement as HTMLElement | null;

        // Adjust position if it goes off-screen
        if (menuRef) {
            const rect = menuRef.getBoundingClientRect();
            if (x + rect.width > window.innerWidth) {
                x = window.innerWidth - rect.width - 10;
            }
            if (y + rect.height > window.innerHeight) {
                y = window.innerHeight - rect.height - 10;
            }
        }

        // Focus the first item on mount
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
    aria-label="Item Actions"
>
    <button type="button" role="menuitem" tabindex={activeIndex === 0 ? 0 : -1} onclick={() => { handleClose(); onAction('add-item'); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        Add new item below
    </button>

    <button type="button" role="menuitem" class="delete-btn" tabindex={activeIndex === 1 ? 0 : -1} onclick={() => { handleClose(); onAction('delete-item'); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        Delete item
    </button>

    <div class="separator"></div>

    <button type="button" role="menuitem" tabindex={activeIndex === 2 ? 0 : -1} onclick={() => { handleClose(); onAction('toggle-vote'); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill={voted ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
        {voted ? "Remove vote" : "Vote for item"}
    </button>

    <button type="button" role="menuitem" tabindex={activeIndex === 3 ? 0 : -1} onclick={() => { handleClose(); onAction('toggle-comments'); }}>
        <span class="comment-icon">💬</span>
        {isCommentsVisible ? "Hide comments" : "Show comments"}
    </button>

    <div class="separator"></div>

    <button type="button" role="menuitem" tabindex={activeIndex === 4 ? 0 : -1} onclick={() => { handleClose(); onAction('toggle-type'); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line>
        </svg>
        Change to {componentType === 'yjstable' ? 'Text' : 'Database'}
    </button>

    <button type="button" role="menuitem" tabindex={activeIndex === 5 ? 0 : -1} onclick={() => { handleClose(); onAction('toggle-calendar-type'); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        Change to {componentType === 'calendar' ? 'Text' : 'Calendar'}
    </button>

    <!-- Withheld when the item's children are not all visual blocks: a Layout
         renders only those, so converting would hide the rest (#4997). -->
    {#if componentType === 'layout' || canBecomeLayout}
        <button type="button" role="menuitem" tabindex={activeIndex === 6 ? 0 : -1} onclick={() => { handleClose(); onAction('toggle-layout-type'); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="12" y1="3" x2="12" y2="21"></line>
            </svg>
            Change to {componentType === 'layout' ? 'Text' : 'Layout'}
        </button>
    {/if}

    {#if componentType === 'layout'}
        <!-- Distinct from "Delete item": unwrapping keeps the arranged blocks
             and removes only the arrangement. -->
        <button type="button" role="menuitem" tabindex={activeIndex === 7 ? 0 : -1} onclick={() => { handleClose(); onAction('unwrap-layout'); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
            Remove layout (keep blocks)
        </button>
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

.context-menu button.delete-btn {
    color: #ef4444;
}

.context-menu button.delete-btn:hover,
.context-menu button.delete-btn:focus-visible {
    background-color: #fef2f2;
}

.separator {
    height: 1px;
    background-color: #e5e7eb;
    margin: 4px 0;
}
</style>
