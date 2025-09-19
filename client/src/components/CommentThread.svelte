<script lang="ts">
import { Comments } from "../schema/app-schema";
import type { Comment } from "../schema/app-schema";
import { YjsSubscriber } from "../stores/YjsSubscriber";

interface Props {
    comments: Comments;
    currentUser: string;
    doc: any;
    onCountChanged?: (count: number) => void;
}

const { comments, currentUser, doc, onCountChanged }: Props = $props();
let newText = $state("");
let editingId = $state<string | null>(null);
let editText = $state("");
let commentsList = $state<Comment[]>((comments as any)?.toPlain?.() ?? []);
let localComments = $state<Comment[]>([]);
let renderCommentsState = $state<Comment[]>([]);
let threadRef: HTMLElement | null = null;

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
    () => {
        try {
            return (comments as any)?.toPlain?.() ?? [];
        } catch {
            return [];
        }
    },
);

// クリック委譲（安全網）: ボタンのonclickが効かない環境でも確実にadd()を呼ぶ
import { onMount } from 'svelte';
onMount(() => {
    try { threadRef?.setAttribute('data-hydrated','1'); } catch {}
    const root = () => threadRef || (document.querySelector('[data-testid="comment-thread"]') as HTMLElement | null);
    const handler = (e: Event) => {
        const el = e.target as HTMLElement | null;
        if (el && el.closest('[data-testid="add-comment-btn"]')) {
            e.preventDefault();
            try { add(); } catch (err) { console.error('[CommentThread] delegated add error', err); }
        }
    };
    const r = root();
    r?.addEventListener('click', handler, { capture: true });

    // 直接ボタンにもリスナを付与（環境差吸収）
    const btn = r?.querySelector('[data-testid="add-comment-btn"]') as HTMLButtonElement | null;
    const btnHandler = (e: Event) => { e.preventDefault(); try { add(); } catch (err) { console.error('[CommentThread] direct add error', err); } };
    if (btn) { btn.setAttribute('data-wired', '1'); btn.addEventListener('click', btnHandler); }

    // 入力が入ったら自動で追加（クリックが拾えない環境の最終フォールバック）
    const inputEl = r?.querySelector('[data-testid="new-comment-input"]') as HTMLInputElement | null;
    const inputHandler = () => {
        if (!inputEl) return;
        if (inputEl.value && !inputEl.getAttribute('data-submitted')) {
            inputEl.setAttribute('data-submitted', '1');
            try { add(); } catch (err) { console.error('[CommentThread] input auto add error', err); }
        }
    };
    inputEl?.addEventListener('input', inputHandler);



    // グローバル（document）でも捕捉して最終的に add() を保証
    const globalHandler = (e: Event) => {
        const el = e.target as HTMLElement | null;
        if (!el || !threadRef) return;
        if (!threadRef.contains(el)) return;
        if (el.closest('[data-testid="add-comment-btn"]')) {
            e.preventDefault();
            try { add(); } catch (err) { console.error('[CommentThread] global delegated add error', err); }
        }
    };
    document.addEventListener('click', globalHandler, { capture: true });

    return () => {
        r?.removeEventListener('click', handler, { capture: true } as any);
        btn?.removeEventListener('click', btnHandler);
        inputEl?.removeEventListener('input', inputHandler);
        document.removeEventListener('click', globalHandler, { capture: true } as any);
    };
});


// ここではローカル更新を優先し、Yjs側の同期は後続のトランザクションで反映される想定

function add() {
    if (!newText) return;
    console.log('[CommentThread] add comment, newText=', newText);
    console.log('[CommentThread] comments object:', comments);

    // comments オブジェクトが不正でも UI は進める（DOM/イベントで確実に反映）
    const time = Date.now();
    let id: string;
    let didYjsAdd = false;
    if (comments && typeof (comments as any).addComment === 'function') {
        const res = (comments as any).addComment(currentUser, newText);
        id = res?.id || `local-${time}-${Math.random().toString(36).slice(2)}`;
        didYjsAdd = true;
        console.log('[CommentThread] comment added to Yjs, id=', id);
    } else {
        console.error('[CommentThread] comments object is invalid or missing addComment; falling back to local DOM only');
        id = `local-${time}-${Math.random().toString(36).slice(2)}`;
    }

    // Yjs 追加直後に即時に一覧・カウントを同期
    {
        const countNow = (comments as any)?.toPlain?.()?.length ?? (comments as any)?.length ?? 1;
        try { onCountChanged?.(countNow); } catch {}
        try { threadRef?.closest('.outliner-item')?.dispatchEvent(new CustomEvent('comment-count-changed', { detail: { count: countNow } })); } catch {}
        commentsList = comments.toPlain();
        recompute();
    }

    // ローカル即時反映（Svelte再描画に頼らずDOM生成）
    try {
        const thread = threadRef;
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
                    // 親アイテムに変更通知を送る（Svelte側で再描画してカウントを更新）
                    const itemEl = thread.closest('.outliner-item') as HTMLElement | null;
                    if (itemEl) {
                        itemEl.dispatchEvent(new CustomEvent('comment-count-changed', { detail: { count: comments.length } }));

                    //  onCountChanged 
                    try { onCountChanged?.(comments.length); } catch {}

                    }
                    // 手動でバッジを更新（保険）
                    const container = thread.closest('[data-item-id]') as HTMLElement | null;
                    if (container) {
                        const header = container.querySelector('.item-header') as HTMLElement | null;
                        if (header) {
                            let countEl = header.querySelector('.comment-count') as HTMLElement | null;
                            const current = thread.querySelectorAll('.comment').length;
                            try { onCountChanged?.(current); } catch {}
                            if (countEl) {
                                if (current <= 0) {
                                    countEl.remove();
                                } else {
                                    countEl.textContent = String(current);
                                }

                                const _countEl2 = header?.querySelector('.comment-count') as HTMLElement | null;
                                if (_countEl2) { _countEl2.style.display = current > 0 ? '' : 'none'; _countEl2.setAttribute('data-debug-updated', '1'); }

                            } else {
                                if (!countEl) {
                                    countEl = document.createElement('span');
                                }

                                const countValue = Math.max(1, current);
                                countEl.className = 'comment-count';
                                countEl.textContent = String(countValue);
                                countEl.setAttribute('data-debug-updated', '1');
                                header.appendChild(countEl);
                            }

                        const countEl2 = header?.querySelector('.comment-count') as HTMLElement | null;
                        if (countEl2) { countEl2.style.display = current > 0 ? '' : 'none'; countEl2.setAttribute('data-debug-updated', '1'); }

                        }
                    }
                };

                div.append(author, textEl, editBtn, deleteBtn);
            };

            renderView(newText);
            thread.appendChild(div);

            // ヘッダ等の被りを避けて中央へスクロール
            try { div.scrollIntoView({ block: 'center' }); } catch {}

            // 親への即時コールバック（最優先ルート）: 手動DOM挿入時のみ即時
            try { if (!didYjsAdd) onCountChanged?.(Math.max(1, thread.querySelectorAll('.comment').length)); } catch {}

            // 親アイテムに変更通知を送る（Svelte側でコメント数バッジを描画）
            const itemEl = thread.closest('.outliner-item') as HTMLElement | null;
            try { console.log('[CommentThread] dispatch event to item id=', itemEl?.getAttribute('data-item-id'), 'count=', (comments as any)?.length ?? (comments as any)?.toPlain?.()?.length ); } catch {}
            if (itemEl) {
                itemEl.dispatchEvent(new CustomEvent('comment-count-changed', { detail: { count: comments.length } }));
            }
        }

            // 手動でバッジを更新（保険）— 追加直後は最低1を保証
            const container = thread.closest('[data-item-id]') as HTMLElement | null;
            if (container) {
                let countEl = container.querySelector('.comment-count') as HTMLElement | null;
                const current = Math.max(1, thread.querySelectorAll('.comment').length);
                if (!countEl) {
                    // 既存のスパンが無い場合は header があれば header に、無ければ container 直下に生成
                    const header = container.querySelector('.item-header') as HTMLElement | null;
                    countEl = document.createElement('span');
                    countEl.className = 'comment-count';
                    (header ?? container).appendChild(countEl);
                }
                countEl.textContent = String(current);
                (countEl as any).style.display = 'inline-block';
                countEl.setAttribute('data-debug-updated', '1');
            }

    } catch (e) {
        console.error('[CommentThread] error in DOM manipulation', e);
    }

    // 既存の状態も一応同期（将来的な反映用）
    commentsList = comments.toPlain();
    recompute();

    // 親へ即時通知（最低1件は存在する想定にする）
    try { onCountChanged?.(1); } catch {}
    try {
        const threadEl = threadRef;
        const itemEl = threadEl?.closest('.outliner-item') as HTMLElement | null;
        if (itemEl) itemEl.dispatchEvent(new CustomEvent('comment-count-changed', { detail: { count: 1 } }));
    } catch {}

    // トリガー再計算以确保UI更新
    setTimeout(() => {
        commentsList = comments.toPlain();
        recompute();
    }, 0);

    // Add a small delay to ensure the UI has time to update
    setTimeout(() => {
        try {
            const threadEl = threadRef;
            const itemEl = threadEl?.closest('.outliner-item') as HTMLElement | null;
            if (itemEl && threadEl) {
                const delayedCount = Math.max(1, threadEl.querySelectorAll('.comment').length);
                itemEl.dispatchEvent(new CustomEvent('comment-count-changed', { detail: { count: delayedCount } }));
                try { onCountChanged?.(delayedCount); } catch {}
                const container = threadEl.closest('[data-item-id]') as HTMLElement | null;
                if (container) {
                    let countEl = container.querySelector('.comment-count') as HTMLElement | null;
                    const current = Math.max(1, threadEl.querySelectorAll('.comment').length);
                    if (!countEl) {
                        const header = container.querySelector('.item-header') as HTMLElement | null;
                        countEl = document.createElement('span');
                        countEl.className = 'comment-count';
                        (header ?? container).appendChild(countEl);
                    }
                    countEl.textContent = String(current);
                    (countEl as any).style.display = current > 0 ? 'inline-block' : 'none';
                    countEl.setAttribute('data-debug-updated', '1');
                    try { console.log('[CommentThread] DOM fallback set count to', current); } catch {}
                }
            }
        } catch (e) {
            console.error('[CommentThread] error triggering comment count refresh', e);
        }
    }, 150);

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

<div class="comment-thread" data-testid="comment-thread" bind:this={threadRef}>
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
    <form onsubmit={(e) => { e.preventDefault(); try { add(); } catch (err) { console.error('[CommentThread] onsubmit add error', err); } }} data-testid="comment-form">
        <input placeholder="Add comment" bind:value={newText} data-testid="new-comment-input" />
        <button type="submit" data-testid="add-comment-btn">Add</button>
    </form>
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
