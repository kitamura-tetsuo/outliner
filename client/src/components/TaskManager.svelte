<script lang="ts">
import { onMount } from "svelte";
import type { Item } from "../schema/app-schema";
import {
    addTask,
    completeTask,
    deleteTask,
    ensureTaskTable,
    localDateTime,
    queryTaskCounts,
    queryTasks,
    reopenTask,
    type TaskCounts,
    type TaskPriority,
    type TaskRecord,
    type TaskView,
} from "../services/taskHabitService";
import { isYjsObservable, isYjsObservableDeep } from "../utils/typeGuards";

interface Props {
    item: Item;
}

let { item }: Props = $props();

// Plain $state mirrors refreshed from Yjs observers + SQL queries (mirror pattern).
let ready = $state(false);
let view = $state<TaskView>("all");
let tasks = $state<TaskRecord[]>([]);
let counts = $state<TaskCounts>({ today: 0, upcoming: 0, overdue: 0, completed: 0, all: 0 });

let title = $state("");
let dueAt = $state("");
let priority = $state<TaskPriority>("medium");
let repeatDays = $state("");

const VIEWS: { key: TaskView; label: string; }[] = [
    { key: "today", label: "Today" },
    { key: "upcoming", label: "Upcoming" },
    { key: "overdue", label: "Overdue" },
    { key: "completed", label: "Completed" },
    { key: "all", label: "All" },
];

async function refresh() {
    if (!ready) return;
    const now = localDateTime();
    const [nextTasks, nextCounts] = await Promise.all([
        queryTasks(item, view, now),
        queryTaskCounts(item, now),
    ]);
    tasks = nextTasks;
    counts = nextCounts;
}

onMount(() => {
    ready = ensureTaskTable(item);
    void refresh();

    // Deep-observe the item's value map so both schema changes and remote
    // cell-level row edits (nested Y.Array<Y.Map>) trigger a re-query.
    const valueMap = item.tree.getNodeValueFromKey(item.key);
    const handler = () => void refresh();
    if (isYjsObservableDeep(valueMap)) valueMap.observeDeep(handler);
    else if (isYjsObservable(valueMap)) valueMap.observe(handler);

    return () => {
        try {
            if (isYjsObservableDeep(valueMap)) valueMap.unobserveDeep(handler);
            else if (isYjsObservable(valueMap)) valueMap.unobserve(handler);
        } catch {}
    };
});

function convertTable() {
    ready = ensureTaskTable(item, true);
    void refresh();
}

function selectView(next: TaskView) {
    view = next;
    void refresh();
}

function submitTask(event: Event) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const repeat = Number(repeatDays);
    addTask(item, {
        title: trimmed,
        dueAt: dueAt || "",
        priority,
        repeatDays: Number.isFinite(repeat) && repeat > 0 ? repeat : 0,
    });
    title = "";
    dueAt = "";
    repeatDays = "";
    void refresh();
}

function toggleTask(task: TaskRecord) {
    if (task.status === "open") completeTask(item, task.id);
    else reopenTask(item, task.id);
    void refresh();
}

function removeTask(task: TaskRecord) {
    deleteTask(item, task.id);
    void refresh();
}

function isOverdue(task: TaskRecord): boolean {
    if (task.status !== "open" || !task.dueAt) return false;
    const due = task.dueAt.length === 10 ? `${task.dueAt}T23:59:59` : task.dueAt;
    return due < localDateTime();
}

function formatDue(due: string): string {
    return due.replace("T", " ");
}
</script>

<!-- Stop pointer events from bubbling into outliner cursor/selection handling,
     matching the SqlBlock controls pattern. -->
<div
    class="task-manager"
    data-testid="task-manager"
    onmousedown={(e: Event) => e.stopPropagation()}
    onclick={(e: Event) => e.stopPropagation()}
    onpointerdown={(e: Event) => e.stopPropagation()}
    onmouseup={(e: Event) => e.stopPropagation()}
    role="presentation"
>
    {#if !ready}
        <div class="convert-note">
            <p>This item already contains a table with a different schema.</p>
            <button type="button" onclick={convertTable} aria-label="Replace table with task table">
                Replace with task table
            </button>
        </div>
    {:else}
        <form class="task-form" onsubmit={submitTask}>
            <input
                type="text"
                bind:value={title}
                placeholder="Add a task…"
                aria-label="Task title"
            />
            <input type="datetime-local" bind:value={dueAt} aria-label="Due date and time" />
            <select bind:value={priority} aria-label="Task priority">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
            </select>
            <input
                type="number"
                min="0"
                bind:value={repeatDays}
                placeholder="Repeat (days)"
                aria-label="Repeat interval in days"
                class="repeat-input"
            />
            <button type="submit" aria-label="Add task">Add</button>
        </form>

        <div class="view-tabs" role="tablist" aria-label="Task views">
            {#each VIEWS as v (v.key)}
                <button
                    type="button"
                    role="tab"
                    aria-selected={view === v.key}
                    class:active={view === v.key}
                    onclick={() => selectView(v.key)}
                >
                    {v.label} ({counts[v.key]})
                </button>
            {/each}
        </div>

        <ul class="task-list">
            {#if tasks.length === 0}
                <li class="empty">No tasks in this view.</li>
            {:else}
                {#each tasks as task (task.id)}
                    <li class="task-row" class:done={task.status === "done"} data-task-id={task.id}>
                        <input
                            type="checkbox"
                            checked={task.status === "done"}
                            onchange={() => toggleTask(task)}
                            aria-label={`Complete ${task.title}`}
                        />
                        <span class="task-title">{task.title}</span>
                        <span class="badge priority {task.priority}">{task.priority}</span>
                        {#if task.dueAt}
                            <span class="badge due" class:overdue={isOverdue(task)}>
                                {formatDue(task.dueAt)}
                            </span>
                        {/if}
                        {#if task.repeatDays > 0}
                            <span class="badge repeat" title={`Repeats every ${task.repeatDays} day(s)`}>
                                ↻ {task.repeatDays}d
                            </span>
                        {/if}
                        {#if task.status === "done" && task.completedAt}
                            <span class="badge completed-at" title="Completed at">
                                ✓ {formatDue(task.completedAt)}
                            </span>
                        {/if}
                        <span class="created-at" title="Registered at">{formatDue(task.createdAt)}</span>
                        <button
                            type="button"
                            class="delete-task"
                            onclick={() => removeTask(task)}
                            aria-label={`Delete ${task.title}`}
                            title="Delete task"
                        >×</button>
                    </li>
                {/each}
            {/if}
        </ul>
    {/if}
</div>

<style>
.task-manager {
    margin-top: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8px;
    width: 100%;
}

.convert-note {
    color: #92400e;
    background: #fef3c7;
    border-radius: 4px;
    padding: 8px;
}

.task-form {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
}

.task-form input[type="text"] {
    flex: 1;
    min-width: 140px;
}

.task-form input,
.task-form select {
    padding: 4px 6px;
    border: 1px solid #ccc;
    border-radius: 4px;
}

.repeat-input {
    width: 110px;
}

.view-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;
    flex-wrap: wrap;
}

.view-tabs button {
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 0.8rem;
    cursor: pointer;
}

.view-tabs button.active {
    background: #2563eb;
    border-color: #2563eb;
    color: #fff;
}

.task-list {
    list-style: none;
    margin: 0;
    padding: 0;
}

.task-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 2px;
    border-bottom: 1px solid #f0f0f0;
}

.task-row.done .task-title {
    text-decoration: line-through;
    color: #888;
}

.task-title {
    flex: 1;
}

.badge {
    font-size: 0.72rem;
    border-radius: 8px;
    padding: 1px 6px;
    background: #f3f4f6;
    color: #374151;
    white-space: nowrap;
}

.badge.priority.high {
    background: #fee2e2;
    color: #b91c1c;
}

.badge.priority.low {
    background: #e0f2fe;
    color: #075985;
}

.badge.due.overdue {
    background: #fee2e2;
    color: #b91c1c;
    font-weight: bold;
}

.badge.repeat {
    background: #ede9fe;
    color: #5b21b6;
}

.badge.completed-at {
    background: #dcfce7;
    color: #166534;
}

.created-at {
    font-size: 0.7rem;
    color: #9ca3af;
    white-space: nowrap;
}

.delete-task {
    background: transparent;
    border: none;
    color: #c00;
    cursor: pointer;
    font-size: 14px;
}

.empty {
    color: #888;
    font-style: italic;
    padding: 6px 2px;
}

button[type="submit"],
.convert-note button {
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 4px 10px;
    cursor: pointer;
}
</style>
