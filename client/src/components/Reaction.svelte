<script lang="ts">
    import type { Comment } from "../schema/app-schema";

    interface Props {
        comment: Comment;
        currentUser: string;
    }

    const { comment, currentUser }: Props = $props();

    const popularEmojis = ["👍", "❤️", "😂", "😮", "😢", "🤔"];

    function toggleReaction(emoji: string) {
        comment.toggleReaction(emoji, currentUser);
    }
</script>

<div class="reactions">
    {#each popularEmojis as emoji}
        <button
            class="reaction"
            onclick={() => toggleReaction(emoji)}
            class:selected={comment.reactions.get(emoji)?.includes(currentUser)}
        >
            {emoji}
            <span class="count">
                {comment.reactions.get(emoji)?.length ?? 0}
            </span>
        </button>
    {/each}
</div>

<style>
    .reactions {
        display: flex;
        gap: 4px;
    }
    .reaction {
        background: #eee;
        border: 1px solid #ccc;
        border-radius: 12px;
        padding: 2px 6px;
        cursor: pointer;
    }
    .reaction.selected {
        background: #ddecff;
        border-color: #007acc;
    }
    .count {
        margin-left: 4px;
        font-size: 0.8em;
        color: #555;
    }
</style>
