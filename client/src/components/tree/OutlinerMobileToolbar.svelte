<script lang="ts">
    import { editorOverlayStore } from "../../stores/EditorOverlayStore.svelte";

    let {
        mobileToolbarBottomOffset = 0,
        resolveActiveItemId,
        handleIndent,
        handleUnindent,
        handleAddSibling
    }: {
        mobileToolbarBottomOffset: number;
        resolveActiveItemId: () => string | null;
        handleIndent: (event: CustomEvent) => void;
        handleUnindent: (event: CustomEvent) => void;
        handleAddSibling: (event: CustomEvent) => void;
    } = $props();
</script>

<div
    class="mobile-action-toolbar"
    data-testid="mobile-action-toolbar"
    role="toolbar"
    aria-label="Mobile Action Toolbar"
    style="bottom: {mobileToolbarBottomOffset}px"
>
    <button type="button"
        class="mobile-toolbar-btn"
        aria-label="Indent"
        title="Indent"
        onclick={() => {
            const activeItemId = resolveActiveItemId();
            if (!activeItemId) return;
            editorOverlayStore.setActiveItem(activeItemId);
            const mockEvent = {
                detail: { itemId: activeItemId },
            } as CustomEvent;
            handleIndent(mockEvent);
        }}
    >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
    </button>
    <button type="button"
        class="mobile-toolbar-btn"
        aria-label="Outdent"
        title="Outdent"
        onclick={() => {
            const activeItemId = resolveActiveItemId();
            if (!activeItemId) return;
            editorOverlayStore.setActiveItem(activeItemId);
            const mockEvent = {
                detail: { itemId: activeItemId },
            } as CustomEvent;
            handleUnindent(mockEvent);
        }}
    >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
    </button>
    <button type="button"
        class="mobile-toolbar-btn"
        aria-label="Insert Above"
        title="Insert Above"
        onclick={() => {
            const activeItemId = resolveActiveItemId();
            if (!activeItemId) return;
            editorOverlayStore.setActiveItem(activeItemId);
            const mockEvent = {
                detail: { itemId: activeItemId, position: "above" },
            } as CustomEvent;
            handleAddSibling(mockEvent);
        }}
    >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
    </button>
    <button type="button"
        class="mobile-toolbar-btn"
        aria-label="Insert Below"
        title="Insert Below"
        onclick={() => {
            const activeItemId = resolveActiveItemId();
            if (!activeItemId) return;
            editorOverlayStore.setActiveItem(activeItemId);
            const mockEvent = {
                detail: { itemId: activeItemId, position: "below" },
            } as CustomEvent;
            handleAddSibling(mockEvent);
        }}
    >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
    </button>
    <button type="button"
        class="mobile-toolbar-btn"
        aria-label="New Child"
        title="New Child"
        onclick={() => {
            const activeItemId = resolveActiveItemId();
            if (!activeItemId) return;
            editorOverlayStore.setActiveItem(activeItemId);
            const mockEvent = {
                detail: { itemId: activeItemId, position: "child" },
            } as CustomEvent;
            handleAddSibling(mockEvent);
        }}
    >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
    </button>
    <button type="button"
        class="mobile-toolbar-btn"
        aria-label="Insert Sibling Below"
        title="Insert Sibling Below"
        onclick={() => {
            const activeItemId = resolveActiveItemId();
            if (!activeItemId) return;
            editorOverlayStore.setActiveItem(activeItemId);

            const activeCursor = (editorOverlayStore as typeof editorOverlayStore & { getCursorForItem?: (id: string) => unknown }).getCursorForItem?.(activeItemId);
            if (activeCursor) {
                const event = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    ctrlKey: true,
                    bubbles: true
                });
                document.dispatchEvent(event);
            }
        }}
    >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 10 4 15 9 20"></polyline>
            <path d="M20 4v7a4 4 0 0 1-4 4H4"></path>
        </svg>
    </button>
</div>

<style>
    /* Mobile Action Toolbar */
    .mobile-action-toolbar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        display: none; /* Hidden by default on desktop */
        background: white;
        border-top: 1px solid #ddd;
        padding: 8px;
        z-index: 1000;
        justify-content: space-around;
        align-items: center;
        height: 50px;
    }

    @media (max-width: 768px) {
        .mobile-action-toolbar {
            display: flex; /* Visible on mobile */
        }
    }

    .mobile-toolbar-btn {
        background: #f0f0f0;
        border: 1px solid #ccc;
        border-radius: 4px;
        padding: 6px 10px;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #333;
    }

    .mobile-toolbar-btn:hover {
        background: #e0e0e0;
    }

    .mobile-toolbar-btn:active {
        background: #d0d0d0;
    }
</style>
