<script lang="ts">
    import { getLogger } from "../lib/logger";

    let {
        model,
        currentUser,
        isPageTitle
    }: {
        model: any;
        currentUser: string;
        isPageTitle: boolean;
    } = $props();

</script>

<div class="vote-action">
    <button type="button"
        class="vote-btn"
        class:voted={model.votes.includes(currentUser)}
        title={model.votes.includes(currentUser) ? "Remove vote" : "Vote"}
        aria-label={model.votes.includes(currentUser) ? "Remove vote" : "Vote for this item"}
        aria-pressed={model.votes.includes(currentUser)}
        onclick={() => model.original.toggleVote(currentUser)}
    >
        <svg width="16" height="16" viewBox="0 0 24 24" fill={model.votes.includes(currentUser) ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
    </button>
    {#if model.votes.length > 0}
        <span class="vote-count">{model.votes.length}</span>
    {/if}
</div>

<style>
    .vote-action {
        display: flex;
        align-items: center;
        gap: 4px;
        color: #888;
        font-size: 13px;
        padding-right: 12px;
    }

    .vote-btn {
        background: none;
        border: none;
        padding: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #aaa;
        border-radius: 4px;
        transition: all 0.2s ease;
    }

    .vote-btn:hover {
        background-color: #f0f0f0;
        color: #666;
    }

    .vote-btn:active {
        transform: scale(0.95);
    }

    .vote-btn.voted {
        color: #f59e0b; /* orange-500 */
    }

    .vote-btn.voted:hover {
        background-color: #fef3c7; /* orange-100 */
    }

    .vote-count {
        font-weight: 500;
        min-width: 12px;
        user-select: none;
    }
</style>
