<script lang="ts">
import { Comment, Comments } from "@common/schema/app-schema";
import { TreeSubscriber } from "../stores/TreeSubscriber";

interface Props {
    comments: Comments;
    currentUser: string;
}

const { comments, currentUser }: Props = $props();
let newText = $state("");
let editingId = $state<string | null>(null);
let editText = $state("");

// TreeSubscriberを使用してcommentsの変更を監視
const commentsSubscriber = new TreeSubscriber(
    comments,
    "nodeChanged",
    () => [...comments],
    () => {}, // 値の設定は不要
);

function add() {
    if (!newText) return;
    comments.addComment(currentUser, newText);
    newText = "";
}
function remove(id: string) {
    comments.deleteComment(id);
}

function startEdit(c: Comment) {
    editingId = c.id;
    editText = c.text;
}

function saveEdit(id: string) {
    comments.updateComment(id, editText);
    editingId = null;
}

const availableReactions = ["❤️", "👍", "👎", "😂", "😮", "😢", "🤔"];

function toggleReaction(commentId: string, emoji: string) {
    comments.toggleReaction(commentId, emoji, currentUser);
}
</script>

<div class="comment-thread" data-testid="comment-thread">
    {#each commentsSubscriber.current as c (c.id)}
        <div class="comment" data-testid="comment-{c.id}">
            {#if editingId === c.id}
                <input bind:value={editText} data-testid="edit-input-{c.id}" />
                <button onclick={() => saveEdit(c.id)} data-testid="save-edit-{c.id}">Save</button>
                <button onclick={() => editingId = null} data-testid="cancel-edit-{c.id}">Cancel</button>
            {:else}
                <span class="author">{c.author}:</span>
                <span class="text">{c.text}</span>
                <button onclick={() => startEdit(c)} class="edit">✎</button>
                <button onclick={() => remove(c.id)} class="delete">×</button>
                <div class="reactions" data-testid="reactions-{c.id}">
                    {#each availableReactions as emoji}
                        <button
                            class="reaction"
                            data-testid="reaction-{c.id}-{emoji}"
                            class:selected={c.reactions.get(emoji)?.includes(currentUser)}
                            onclick={() => toggleReaction(c.id, emoji)}
                        >
                            {emoji} {c.reactions.get(emoji)?.length || 0}
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
    {/each}
    <input placeholder="Add comment" bind:value={newText} data-testid="new-comment-input" />
    <button onclick={add} disabled={!newText} data-testid="add-comment-btn">Add</button>
</div>

<style>
.comment-thread {
    margin-top: 4px;
    padding-left: 20px;
}
.comment {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 2px;
}
.comment .delete {
    background: none;
    border: none;
    color: #c00;
    cursor: pointer;
}
.comment .edit {
    background: none;
    border: none;
    color: #007acc;
    cursor: pointer;
}

.reactions {
    display: flex;
    gap: 4px;
}

.reaction {
    background-color: #eee;
    border: 1px solid #ccc;
    border-radius: 12px;
    padding: 2px 6px;
    cursor: pointer;
    font-size: 12px;
}

.reaction.selected {
    background-color: #d0eaff;
    border-color: #007acc;
}
</style>
