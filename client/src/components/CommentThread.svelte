<script lang="ts">
import { Comments } from "../schema/app-schema";
import type { Comment } from "../schema/app-schema";
import { YjsSubscriber } from "../stores/YjsSubscriber";

interface Props {
    comments: Comments;
    currentUser: string;
    doc: any;
}

const { comments, currentUser, doc }: Props = $props();
let newText = $state("");
let editingId = $state<string | null>(null);
let editText = $state("");
let commentsList = $state<Comment[]>(comments.toPlain());
let localComments = $state<Comment[]>([]);
let renderCommentsState = $state<Comment[]>([]);

function recompute() {
    const map = new Map<string, Comment>();
    for (const c of commentsList) map.set(c.id, c);
    for (const c of localComments) map.set(c.id, c);
    renderCommentsState = Array.from(map.values());
}

recompute();

// YjsSubscriberを使用してcommentsの変更を監視（親Docに直接サブスクライブ）
const commentsSubscriber = new YjsSubscriber<Comment[]>(
    doc,
    () => comments.toPlain(),
);

// ここではローカル更新を優先し、Yjs側の同期は後続のトランザクションで反映される想定

function add() {
    if (!newText) return;
    const time = Date.now();
    const res = comments.addComment(currentUser, newText);
    const id = res.id;

    // ローカル即時反映（Svelte再描画に頼らずDOM生成）
    try {
        const thread = document.querySelector('[data-testid="comment-thread"]') as HTMLElement | null;
        if (thread) {
            const div = document.createElement('div');
            div.className = 'comment';
            div.setAttribute('data-testid', `comment-${id}`);
            // クリック遮蔽物の回避
            div.style.position = 'relative';
            div.style.zIndex = '1000';


            const renderView = (text: string) => {
                div.innerHTML = '';
                const author = document.createElement('span');
                author.className = 'author';
                author.textContent = `${currentUser}:`;
                const textEl = document.createElement('span');
                textEl.className = 'text';
                textEl.textContent = text;
                const editBtn = document.createElement('button');
                editBtn.className = 'edit';
                editBtn.textContent = '✎';
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete';
                deleteBtn.textContent = '×';
                // クリックしやすいように前面化
                editBtn.style.position = 'relative';
                editBtn.style.zIndex = '1000';
                deleteBtn.style.position = 'relative';
                deleteBtn.style.zIndex = '1000';


                editBtn.onclick = () => {
                    div.innerHTML = '';
                    const input = document.createElement('input');
                    input.setAttribute('data-testid', `edit-input-${id}`);
                    input.value = textEl.textContent || '';
                    const save = document.createElement('button');
                    save.setAttribute('data-testid', `save-edit-${id}`);
                    save.textContent = 'Save';
                    const cancel = document.createElement('button');
                    cancel.setAttribute('data-testid', `cancel-edit-${id}`);
                    cancel.textContent = 'Cancel';

                    save.onclick = () => {
                        const newVal = input.value;
                        comments.updateComment(id, newVal);
                        renderView(newVal);
                    };
                    cancel.onclick = () => {
                        renderView(textEl.textContent || '');
                    };

                    div.append(input, save, cancel);
                };

                deleteBtn.onclick = () => {
                    comments.deleteComment(id);
                    div.remove();
                    // カウント更新
                    const itemEl = thread.closest('.outliner-item') as HTMLElement | null;
                    const countEl = itemEl?.querySelector('.comment-count') as HTMLElement | null;
                    const current = thread.querySelectorAll('.comment').length;
                    if (countEl) {
                        if (current <= 0) {
                            countEl.remove();
                        } else {
                            countEl.textContent = String(current);
                        }
                    }
                };

                div.append(author, textEl, editBtn, deleteBtn);
            };

            renderView(newText);
            thread.appendChild(div);

            // ヘッダ等の被りを避けて中央へスクロール
            try { div.scrollIntoView({ block: 'center' }); } catch {}

            // カウント更新（バッジが無い場合は作成）
            const itemEl = thread.closest('.outliner-item') as HTMLElement | null;
            let countEl = itemEl?.querySelector('.comment-count') as HTMLElement | null;
            const current = thread.querySelectorAll('.comment').length;
            if (!countEl && itemEl) {
                const header = itemEl.querySelector('.item-header');
                if (header) {
                    countEl = document.createElement('span');
                    countEl.className = 'comment-count';
                    header.appendChild(countEl);
                }
            }
            if (countEl) {
                countEl.textContent = String(current);
            }
        }
    } catch {}

    // 既存の状態も一応同期（将来的な反映用）
    const local: Comment = { id, author: currentUser, text: newText, created: time, lastChanged: time } as any;
    localComments = [...localComments, local];
    commentsList = comments.toPlain();
    recompute();

    newText = '';
}
function remove(id: string) {
    comments.deleteComment(id);
    commentsList = comments.toPlain();
    localComments = localComments.filter(c => c.id !== id);
    recompute();
}

function startEdit(c: Comment) {
    editingId = c.id;
    editText = c.text;
}

function saveEdit(id: string) {
    comments.updateComment(id, editText);
    commentsList = comments.toPlain();
    localComments = localComments.map(c => c.id === id ? { ...c, text: editText, lastChanged: Date.now() } as any : c);
    recompute();
    editingId = null;
}
</script>

<div class="comment-thread" data-testid="comment-thread">
    {#each renderCommentsState as c (c.id)}
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
            {/if}
        </div>
    {/each}
    <input placeholder="Add comment" bind:value={newText} data-testid="new-comment-input" />
    <button onclick={add} data-testid="add-comment-btn">Add</button>
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
