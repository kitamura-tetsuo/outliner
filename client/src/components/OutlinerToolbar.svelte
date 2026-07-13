<script lang="ts">
    import { resolvePath } from "../utils/pathUtils";

    interface Props {
        mode: "desktop" | "mobile";
        // Desktop toolbar props
        projectName?: string;
        pageName?: string;
        onAddItem?: () => void;
        onFileSelect?: (event: Event) => void;
        // Mobile action toolbar props
        mobileToolbarBottomOffset?: number;
        onIndent?: () => void;
        onOutdent?: () => void;
        onInsertAbove?: () => void;
        onInsertBelow?: () => void;
        onNewChild?: () => void;
        onInsertSiblingBelow?: () => void;
        onDelete?: () => void;
        onVote?: () => void;
    }

    let {
        mode,
        projectName = "",
        pageName = "",
        onAddItem,
        onFileSelect,
        mobileToolbarBottomOffset = 0,
        onIndent,
        onOutdent,
        onInsertAbove,
        onInsertBelow,
        onNewChild,
        onInsertSiblingBelow,
        onDelete,
        onVote,
    }: Props = $props();

    // File input used by the "Add Image" action. Kept local to this component
    // since both the button that triggers the click and the input element itself
    // live in this component's markup now.
    let fileInput: HTMLInputElement | null = $state(null);

    function triggerFileSelect() {
        if (fileInput) {
            fileInput.click();
        }
    }

    function handleFileInputChange(event: Event) {
        onFileSelect?.(event);
    }
</script>

{#if mode === "desktop"}
    <div class="toolbar">
        <div class="actions">
            <button type="button" onclick={onAddItem}>Add Item</button>
            <button type="button" onclick={triggerFileSelect} aria-label="Add Image" title="Add Image">Add Image</button>
            <input
                type="file"
                accept="image/*"
                multiple
                bind:this={fileInput}
                onchange={handleFileInputChange}
                style="display: none;"
            />
            <a href={resolvePath(projectName === "demo" ? `/demo/${encodeURIComponent(pageName)}/diff` : `/${encodeURIComponent(projectName)}/${encodeURIComponent(pageName)}/diff`)} class="button-style">History / Diff</a>
        </div>
        <details class="a11y-help">
            <summary>Keyboard &amp; accessibility help</summary>
            <ul>
                <li><strong>Tab</strong> / <strong>Shift+Tab</strong>: indent / outdent the current item (alternative to dragging into or out of a parent)</li>
                <li><strong>Alt+↑</strong> / <strong>Alt+↓</strong>: move the current item (and its children) up or down among its siblings (alternative to drag-and-drop reordering)</li>
                <li><strong>↑</strong> / <strong>↓</strong>: move the cursor between items</li>
                <li><strong>Enter</strong>: add a new item below the current one</li>
            </ul>
        </details>
    </div>
{:else}
    <!-- Mobile Action Toolbar (appears on mobile devices when needed) -->
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
            onclick={onIndent}
        >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </button>
        <button type="button"
            class="mobile-toolbar-btn"
            aria-label="Outdent"
            title="Outdent"
            onclick={onOutdent}
        >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        </button>
        <button type="button"
            class="mobile-toolbar-btn"
            aria-label="Insert Above"
            title="Insert Above"
            onclick={onInsertAbove}
        >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
        </button>
        <button type="button"
            class="mobile-toolbar-btn"
            aria-label="Insert Below"
            title="Insert Below"
            onclick={onInsertBelow}
        >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
        </button>
        <button type="button"
            class="mobile-toolbar-btn"
            aria-label="New Child"
            title="New Child"
            onclick={onNewChild}
        >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <button type="button"
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
        <button type="button"
            class="mobile-toolbar-btn"
            aria-label="Vote"
            title="Vote"
            onclick={onVote}
        >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
        </button>
        <button type="button"
            class="mobile-toolbar-btn"
            aria-label="Delete"
            title="Delete"
            onclick={onDelete}
        >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
    </div>
{/if}

<style>
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

    .actions button, .actions a.button-style {
        text-decoration: none;
        color: inherit;
        display: inline-flex;
        align-items: center;
        box-sizing: border-box;
        background: #f0f0f0;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 14px;
    }

    .actions button:hover, .actions a.button-style:hover {
        background: #e8e8e8;
    }

    .a11y-help {
        margin-top: 8px;
        font-size: 13px;
        color: #444;
    }

    .a11y-help summary {
        cursor: pointer;
        color: #2563eb;
    }

    .a11y-help ul {
        margin: 8px 0 0;
        padding-left: 20px;
    }

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
        overflow-x: auto;
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
        width: 40px;
        height: 40px;
        flex-shrink: 0;
    }

    .mobile-toolbar-btn:hover {
        background: #e0e0e0;
    }
</style>
