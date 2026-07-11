<script lang="ts">
    import { resolvePath } from "../utils/pathUtils";

    interface Props {
        projectName: string;
        pageName: string;
        onAddItem: () => void;
        onTriggerFileSelect: () => void;
        onFileSelect: (event: Event) => void;
        fileInput: HTMLInputElement | null;
    }

    let {
        projectName,
        pageName,
        onAddItem,
        onTriggerFileSelect,
        onFileSelect,
        fileInput = $bindable(null),
    }: Props = $props();
</script>

<div class="toolbar">
    <div class="actions">
        <button type="button" onclick={onAddItem}>Add Item</button>
        <button type="button" onclick={onTriggerFileSelect} aria-label="Add Image" title="Add Image">Add Image</button>
        <input
            type="file"
            accept="image/*"
            multiple
            bind:this={fileInput}
            onchange={onFileSelect}
            style="display: none;"
        />
        <a href={resolvePath(`/${projectName}/${pageName}/diff`)} class="button-style">History / Diff</a>
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

<style>
    .toolbar {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 2rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--border-color);
        flex-shrink: 0; /* Prevent toolbar from shrinking */
    }

    .toolbar .actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .toolbar button, .toolbar .button-style {
        padding: 0.5rem 1rem;
        border: 1px solid var(--border-color);
        background: var(--bg-color);
        border-radius: 4px;
        cursor: pointer;
        color: var(--text-color);
        font-size: 0.9rem;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-family: inherit;
    }

    .toolbar .button-style {
        box-sizing: border-box;
        line-height: normal;
    }

    .toolbar button:hover, .toolbar .button-style:hover {
        background: var(--hover-bg-color);
    }

    .a11y-help {
        font-size: 0.85rem;
        color: var(--text-muted);
        max-width: 400px;
        background: var(--bg-color-secondary);
        padding: 0.5rem;
        border-radius: 4px;
        border: 1px solid var(--border-color);
    }

    .a11y-help summary {
        cursor: pointer;
        font-weight: 500;
        margin-bottom: 0.5rem;
    }

    .a11y-help ul {
        margin: 0;
        padding-left: 1.5rem;
    }

    .a11y-help li {
        margin-bottom: 0.25rem;
    }

    /* Mobile specific styles for the top toolbar */
    @media (max-width: 768px) {
        .toolbar {
            flex-direction: column-reverse;
            gap: 1rem;
            align-items: stretch;
            /* Hide the actions on mobile, they will be in the bottom toolbar */
            .actions {
                display: none;
            }
        }

        .a11y-help {
            max-width: 100%;
        }
    }
</style>
