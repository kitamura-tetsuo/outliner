<script lang="ts">
import {
    Comment,
    Comments,
} from "../schema/app-schema";
import { TreeSubscriber } from "../stores/TreeSubscriber";
import Reaction from "./Reaction.svelte";

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
</script>

<div class="comment-thread" data-testid="comment-thread">
    {#each commentsSubscriber.current as c (c.id)}
        <div class="comment" data-testid="comment-{c.id}">
            {#if editingId === c.id}
                <input bind:value={editText} data-testid="edit-input-{c.id}" />
                <button onclick={() => saveEdit(c.id)} data-testid="save-edit-{c.id}">Save</button>
                <button onclick={() => editingId = null} data-testid="cancel-edit-{c.id}">Cancel</button>
            {:else}
                <div class="comment-content">
                    <span class="author">{c.author}:</span>
                    <span class="text">{c.text}</span>
                    <button onclick={() => startEdit(c)} class="edit">✎</button>
                    <button onclick={() => remove(c.id)} class="delete">×</button>
                </div>
                <Reaction {comment} {currentUser} />
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
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    margin-bottom: 2px;
}
.comment-content {
    display: flex;
    align-items: center;
    gap: 4px;
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
</style>
