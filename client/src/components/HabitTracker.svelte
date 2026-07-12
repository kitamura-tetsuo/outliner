<script lang="ts">
import { onMount } from "svelte";
import type { Item } from "../schema/app-schema";
import {
    addHabit,
    deleteHabit,
    ensureHabitTable,
    localDate,
    queryHabitStats,
    recentDates,
    toggleHabitLog,
    type HabitStat,
} from "../services/taskHabitService";
import { isYjsObservable, isYjsObservableDeep } from "../utils/typeGuards";

interface Props {
    item: Item;
}

let { item }: Props = $props();

const GRID_DAYS = 7;

// Plain $state mirrors refreshed from Yjs observers + SQL queries (mirror pattern).
let ready = $state(false);
let habits = $state<HabitStat[]>([]);
let days = $state<string[]>(recentDates(GRID_DAYS));

let name = $state("");
let intervalDays = $state("1");

async function refresh() {
    if (!ready) return;
    days = recentDates(GRID_DAYS);
    habits = await queryHabitStats(item);
}

onMount(() => {
    ready = ensureHabitTable(item);
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
    ready = ensureHabitTable(item, true);
    void refresh();
}

function submitHabit(event: Event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const interval = Number(intervalDays);
    addHabit(item, trimmed, Number.isFinite(interval) && interval > 0 ? interval : 1);
    name = "";
    intervalDays = "1";
    void refresh();
}

function toggleDay(habit: HabitStat, date: string) {
    toggleHabitLog(item, habit.id, date);
    void refresh();
}

function removeHabit(habit: HabitStat) {
    deleteHabit(item, habit.id);
    void refresh();
}

function dayLabel(date: string): string {
    return date.slice(8); // day of month
}
</script>

<div class="habit-tracker" data-testid="habit-tracker">
    {#if !ready}
        <div class="convert-note">
            <p>This item already contains a table with a different schema.</p>
            <button type="button" onclick={convertTable} aria-label="Replace table with habit table">
                Replace with habit table
            </button>
        </div>
    {:else}
        <form class="habit-form" onsubmit={submitHabit}>
            <input type="text" bind:value={name} placeholder="Add a habit…" aria-label="Habit name" />
            <label class="interval-label">
                every
                <input
                    type="number"
                    min="1"
                    bind:value={intervalDays}
                    aria-label="Habit interval in days"
                    class="interval-input"
                />
                day(s)
            </label>
            <button type="submit" aria-label="Add habit">Add</button>
        </form>

        {#if habits.length === 0}
            <p class="empty">No habits yet. Add one above.</p>
        {:else}
            <table class="habit-grid">
                <thead>
                    <tr>
                        <th class="name-col">Habit</th>
                        {#each days as day (day)}
                            <th class="day-col" class:today={day === localDate()}>{dayLabel(day)}</th>
                        {/each}
                        <th>Streak</th>
                        <th>Total</th>
                        <th class="actions-col" aria-label="Habit actions"></th>
                    </tr>
                </thead>
                <tbody>
                    {#each habits as habit (habit.id)}
                        <tr data-habit-id={habit.id}>
                            <td class="name-col">
                                <span class="habit-name">{habit.name}</span>
                                {#if habit.intervalDays > 1}
                                    <span class="interval-badge">every {habit.intervalDays}d</span>
                                {/if}
                            </td>
                            {#each days as day (day)}
                                <td class="day-col" class:today={day === localDate()}>
                                    <button
                                        type="button"
                                        class="day-toggle"
                                        class:checked={habit.logDates.includes(day)}
                                        onclick={() => toggleDay(habit, day)}
                                        aria-label={`Toggle ${habit.name} on ${day}`}
                                        aria-pressed={habit.logDates.includes(day)}
                                    >
                                        {habit.logDates.includes(day) ? "✓" : ""}
                                    </button>
                                </td>
                            {/each}
                            <td class="stat" data-testid="habit-streak">
                                {habit.streak > 0 ? `🔥 ${habit.streak}` : "–"}
                            </td>
                            <td class="stat">{habit.total}</td>
                            <td class="actions-col">
                                <button
                                    type="button"
                                    class="delete-habit"
                                    onclick={() => removeHabit(habit)}
                                    aria-label={`Delete ${habit.name}`}
                                    title="Delete habit and its history"
                                >×</button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        {/if}
    {/if}
</div>

<style>
.habit-tracker {
    margin-top: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8px;
    width: 100%;
    overflow-x: auto;
}

.convert-note {
    color: #92400e;
    background: #fef3c7;
    border-radius: 4px;
    padding: 8px;
}

.habit-form {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
}

.habit-form input[type="text"] {
    flex: 1;
    min-width: 140px;
    padding: 4px 6px;
    border: 1px solid #ccc;
    border-radius: 4px;
}

.interval-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.85rem;
    color: #374151;
}

.interval-input {
    width: 56px;
    padding: 4px 6px;
    border: 1px solid #ccc;
    border-radius: 4px;
}

.habit-grid {
    border-collapse: collapse;
    width: 100%;
}

.habit-grid th,
.habit-grid td {
    border: 1px solid #eee;
    padding: 4px 6px;
    text-align: center;
    font-size: 0.85rem;
}

.name-col {
    text-align: left;
    min-width: 120px;
}

.habit-name {
    font-weight: 600;
}

.interval-badge {
    margin-left: 6px;
    font-size: 0.7rem;
    background: #ede9fe;
    color: #5b21b6;
    border-radius: 8px;
    padding: 1px 6px;
    white-space: nowrap;
}

.day-col.today {
    background: #eff6ff;
}

.day-toggle {
    width: 24px;
    height: 24px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    color: #16a34a;
    font-weight: bold;
}

.day-toggle.checked {
    background: #dcfce7;
    border-color: #16a34a;
}

.stat {
    white-space: nowrap;
}

.actions-col {
    width: 28px;
}

.delete-habit {
    background: transparent;
    border: none;
    color: #c00;
    cursor: pointer;
    font-size: 14px;
}

.empty {
    color: #888;
    font-style: italic;
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
