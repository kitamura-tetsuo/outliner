<script lang="ts">
    import { onMount } from "svelte";

    interface Props {
        x: number;
        y: number;
        voted: boolean;
        isCommentsVisible: boolean;
        componentType: string;
        onClose: () => void;
        onAction: (action: string) => void;
    }

    let { x, y, voted, isCommentsVisible, componentType, onClose, onAction }: Props = $props();
    let menuRef: HTMLDivElement;

    onMount(() => {
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
        setTimeout(() => {
            const firstButton = menuRef?.querySelector("button");
            if (firstButton) firstButton.focus();
        }, 0);
    });

    function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            onClose();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const buttons = Array.from(menuRef?.querySelectorAll("button") || []);
            const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (currentIndex > -1) {
                const nextIndex = event.key === "ArrowDown"
                    ? (currentIndex + 1) % buttons.length
                    : (currentIndex - 1 + buttons.length) % buttons.length;
                buttons[nextIndex].focus();
            } else if (buttons.length > 0) {
                buttons[0].focus();
            }
        }
    }
</script>

<svelte:window on:keydown={handleKeyDown} />

<div class="context-menu-overlay" role="presentation" onclick={onClose} oncontextmenu={(e) => { e.preventDefault(); onClose(); }}></div>

<div
    bind:this={menuRef}
    class="context-menu"
    style="left: {x}px; top: {y}px;"
    role="menu"
    aria-label="Item Actions"
>
    <button type="button" role="menuitem" onclick={() => { onAction('add-item'); onClose(); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        Add new item below
    </button>

    <button type="button" role="menuitem" class="delete-btn" onclick={() => { onAction('delete-item'); onClose(); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        Delete item
    </button>

    <div class="separator"></div>

    <button type="button" role="menuitem" onclick={() => { onAction('toggle-vote'); onClose(); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill={voted ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
        {voted ? "Remove vote" : "Vote for item"}
    </button>

    <button type="button" role="menuitem" onclick={() => { onAction('toggle-comments'); onClose(); }}>
        <span class="comment-icon">💬</span>
        {isCommentsVisible ? "Hide comments" : "Show comments"}
    </button>

    <div class="separator"></div>

    <button type="button" role="menuitem" onclick={() => { onAction('toggle-type'); onClose(); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line>
        </svg>
        Change to {componentType === 'yjstable' ? 'Text' : 'Database'}
    </button>
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
