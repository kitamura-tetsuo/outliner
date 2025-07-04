<script lang="ts">
import {
    Comment,
    Comments,
} from "../schema/app-schema";
export let comments: Comments;
export let currentUser: string;
let newText = "";
let editingId: string | null = null;
let editText = "";

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
    {#each comments as c (c.id)}
        <div class="comment" data-testid="comment-{c.id}">
            {#if editingId === c.id}
                <input bind:value={editText} data-testid="edit-input-{c.id}" />
                <button on:click={() => saveEdit(c.id)} data-testid="save-edit-{c.id}">Save</button>
                <button on:click={() => editingId = null} data-testid="cancel-edit-{c.id}">Cancel</button>
            {:else}
                <span class="author">{c.author}:</span>
                <span class="text">{c.text}</span>
                <button on:click={() => startEdit(c)} class="edit">✎</button>
                <button on:click={() => remove(c.id)} class="delete">×</button>
            {/if}
        </div>
    {/each}
    <input placeholder="Add comment" bind:value={newText} data-testid="new-comment-input" />
    <button on:click={add} disabled={!newText} data-testid="add-comment-btn">Add</button>
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
</style>
