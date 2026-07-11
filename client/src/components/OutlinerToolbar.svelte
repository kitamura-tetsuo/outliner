<script lang="ts">
    import { goto } from "$app/navigation";
    import { resolvePath } from "../utils/pathUtils";

    interface Props {
        projectName: string;
        pageName: string;
        onAddItem: () => void;
        onTriggerFileSelect: () => void;
        fileInput: HTMLInputElement | null;
        onFileSelect: (e: Event) => void;
        onFileInputChange: (el: HTMLInputElement | null) => void;
        mobileToolbarBottomOffset: number;
        onIndent: () => void;
        onOutdent: () => void;
        onInsertAbove: () => void;
        onInsertBelow: () => void;
        onNewChild: () => void;
        onInsertSiblingBelow: () => void;
    }

    let {
        projectName,
        pageName,
        onAddItem,
        onTriggerFileSelect,
        fileInput,
        onFileSelect,
        onFileInputChange,
        mobileToolbarBottomOffset,
        onIndent,
        onOutdent,
        onInsertAbove,
        onInsertBelow,
        onNewChild,
        onInsertSiblingBelow
    }: Props = $props();

    // We bind localFileInput and update the parent using onFileInputChange
    let localFileInput: HTMLInputElement | null = $state(null);

    $effect(() => {
        if (localFileInput !== fileInput) {
            onFileInputChange(localFileInput);
        }
    });

</script>

<div class="toolbar">
    <div class="actions">
        <button onclick={onAddItem}>Add Item</button>
        <button onclick={onTriggerFileSelect} aria-label="Add Image" title="Add Image">Add Image</button>
        <input
            type="file"
            accept="image/*"
            multiple
            bind:this={localFileInput}
            onchange={onFileSelect}
            style="display: none;"
        />
        <button
            onclick={() => goto(resolvePath(`/${projectName}/${pageName}/diff`))}
        >
            History / Diff
        </button>
    </div>
</div>

<!-- Mobile Action Toolbar (appears on mobile devices when needed) -->
<div
    class="mobile-action-toolbar"
    data-testid="mobile-action-toolbar"
    role="toolbar"
    aria-label="Mobile Action Toolbar"
    style="bottom: {mobileToolbarBottomOffset}px"
>
    <button
        class="mobile-toolbar-btn"
        aria-label="Indent"
        title="Indent"
        onclick={onIndent}
    >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
    </button>
    <button
        class="mobile-toolbar-btn"
        aria-label="Outdent"
        title="Outdent"
        onclick={onOutdent}
    >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
    </button>
    <button
        class="mobile-toolbar-btn"
        aria-label="Insert Above"
        title="Insert Above"
        onclick={onInsertAbove}
    >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
    </button>
    <button
        class="mobile-toolbar-btn"
        aria-label="Insert Below"
        title="Insert Below"
        onclick={onInsertBelow}
    >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
    </button>
    <button
        class="mobile-toolbar-btn"
        aria-label="New Child"
        title="New Child"
        onclick={onNewChild}
    >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
    </button>
    <button
        class="mobile-toolbar-btn"
        aria-label="Insert Sibling Below"
        title="Insert Sibling Below"
        onclick={onInsertSiblingBelow}
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
        display: flex; /* Always visible */
        background: white;
        border-top: 1px solid #ddd;
        padding: 8px;
        z-index: 1000;
        justify-content: space-around;
        align-items: center;
        height: 50px;
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
        width: 40px;
        height: 40px;
    }

    .mobile-toolbar-btn:hover {
        background: #e0e0e0;
    }

    .toolbar {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        padding: 8px 16px;
        background: #f5f5f5;
        border-bottom: 1px solid #ddd;
        flex-shrink: 0; /* Prevent toolbar from shrinking */
    }

    .actions {
        display: flex;
        gap: 8px;
    }

    .actions button {
        background: #f0f0f0;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 14px;
    }

    .actions button:hover {
        background: #e8e8e8;
    }
</style>
