import { describe, expect, it } from "vitest";
import { Item } from "../schema/app-schema";
import {
    addDays,
    addHabit,
    addTask,
    completeTask,
    computeStreak,
    deleteHabit,
    deleteTask,
    ensureHabitTable,
    ensureTaskTable,
    HABIT_COLUMNS,
    queryHabitStats,
    queryTaskCounts,
    queryTasks,
    recentDates,
    reopenTask,
    TASK_COLUMNS,
    TASK_TABLE_DDL,
    toggleHabitLog,
} from "./taskHabitService";

const NOW = "2026-07-12T10:00:00";

function newTaskItem(): Item {
    const item = new Item({ text: "tasks" });
    expect(ensureTaskTable(item)).toBe(true);
    return item;
}

function newHabitItem(): Item {
    const item = new Item({ text: "habits" });
    expect(ensureHabitTable(item)).toBe(true);
    return item;
}

describe("taskHabitService tasks", () => {
    it("defines the task table on an empty item but refuses to clobber a foreign table", () => {
        const item = new Item({ text: "t" });
        item.defineTable("CREATE TABLE other (id TEXT)", ["id"]);
        expect(ensureTaskTable(item)).toBe(false);
        expect(item.tableSchema).toBe("CREATE TABLE other (id TEXT)");
        expect(ensureTaskTable(item, true)).toBe(true);
        expect(item.tableSchema).toBe(TASK_TABLE_DDL);
    });

    it("records the registration timestamp and defaults when adding a task", () => {
        const item = newTaskItem();
        addTask(item, { title: "Write report" }, NOW);
        const rows = item.tableRows.toPlain(TASK_COLUMNS);
        expect(rows).toHaveLength(1);
        expect(rows[0].title).toBe("Write report");
        expect(rows[0].status).toBe("open");
        expect(rows[0].priority).toBe("medium");
        expect(rows[0].created_at).toBe(NOW);
        expect(rows[0].completed_at).toBe("");
        expect(rows[0].repeat_days).toBe("");
    });

    it("completes and reopens a one-shot task, tracking the completion timestamp", () => {
        const item = newTaskItem();
        const id = addTask(item, { title: "One shot", dueAt: "2026-07-12" }, NOW);

        const spawned = completeTask(item, id, NOW);
        expect(spawned).toBeUndefined();
        let rows = item.tableRows.toPlain(TASK_COLUMNS);
        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe("done");
        expect(rows[0].completed_at).toBe(NOW);

        reopenTask(item, id);
        rows = item.tableRows.toPlain(TASK_COLUMNS);
        expect(rows[0].status).toBe("open");
        expect(rows[0].completed_at).toBe("");
    });

    it("spawns the next occurrence of an interval-recurring task on completion", () => {
        const item = newTaskItem();
        const id = addTask(item, { title: "Water plants", dueAt: "2026-07-12T09:00", repeatDays: 3 }, NOW);

        const spawnedId = completeTask(item, id, NOW);
        expect(spawnedId).toBeDefined();
        const rows = item.tableRows.toPlain(TASK_COLUMNS);
        expect(rows).toHaveLength(2);
        const next = rows.find((r) => r.id === spawnedId)!;
        expect(next.title).toBe("Water plants");
        expect(next.status).toBe("open");
        expect(next.due_at).toBe("2026-07-15T09:00");
        expect(next.repeat_days).toBe("3");
        expect(next.created_at).toBe(NOW);
    });

    it("advances an overdue recurring task past 'now' when completed late", () => {
        const item = newTaskItem();
        // Due 10 days ago with a 3-day interval: next due must be in the future.
        const id = addTask(item, { title: "Trash day", dueAt: "2026-07-02T09:00", repeatDays: 3 }, NOW);
        const spawnedId = completeTask(item, id, NOW);
        const next = item.tableRows.toPlain(TASK_COLUMNS).find((r) => r.id === spawnedId)!;
        expect(next.due_at).toBe("2026-07-14T09:00");
    });

    it("filters SQL views: today, overdue, upcoming and completed", async () => {
        const item = newTaskItem();
        addTask(item, { title: "Due today", dueAt: "2026-07-12T18:00" }, NOW);
        addTask(item, { title: "Overdue", dueAt: "2026-07-10" }, NOW);
        addTask(item, { title: "Future", dueAt: "2026-07-20" }, NOW);
        addTask(item, { title: "No due date" }, NOW);
        const doneId = addTask(item, { title: "Finished", dueAt: "2026-07-11" }, NOW);
        completeTask(item, doneId, NOW);

        const today = await queryTasks(item, "today", NOW);
        expect(today.map((t) => t.title)).toEqual(["Due today"]);

        const overdue = await queryTasks(item, "overdue", NOW);
        expect(overdue.map((t) => t.title)).toEqual(["Overdue"]);

        const upcoming = await queryTasks(item, "upcoming", NOW);
        expect(upcoming.map((t) => t.title)).toEqual(["Due today", "Future", "No due date"]);

        const completed = await queryTasks(item, "completed", NOW);
        expect(completed.map((t) => t.title)).toEqual(["Finished"]);
        expect(completed[0].completedAt).toBe(NOW);

        const counts = await queryTaskCounts(item, NOW);
        expect(counts).toEqual({ today: 1, upcoming: 3, overdue: 1, completed: 1, all: 5 });
    });

    it("treats a date-only due date as due at the end of the day", async () => {
        const item = newTaskItem();
        addTask(item, { title: "All-day today", dueAt: "2026-07-12" }, NOW);
        const overdue = await queryTasks(item, "overdue", NOW);
        expect(overdue).toHaveLength(0);
        const today = await queryTasks(item, "today", NOW);
        expect(today.map((t) => t.title)).toEqual(["All-day today"]);
    });

    it("orders the all view with open tasks first, by due date then priority", async () => {
        const item = newTaskItem();
        addTask(item, { title: "Low soon", dueAt: "2026-07-13", priority: "low" }, NOW);
        addTask(item, { title: "High soon", dueAt: "2026-07-13", priority: "high" }, NOW);
        addTask(item, { title: "No due" }, NOW);
        const doneId = addTask(item, { title: "Done", dueAt: "2026-07-13" }, NOW);
        completeTask(item, doneId, NOW);

        const all = await queryTasks(item, "all", NOW);
        expect(all.map((t) => t.title)).toEqual(["High soon", "Low soon", "No due", "Done"]);
    });

    it("deletes a task row", () => {
        const item = newTaskItem();
        const id = addTask(item, { title: "Remove me" }, NOW);
        addTask(item, { title: "Keep me" }, NOW);
        deleteTask(item, id);
        const rows = item.tableRows.toPlain(TASK_COLUMNS);
        expect(rows.map((r) => r.title)).toEqual(["Keep me"]);
    });
});

describe("taskHabitService habits", () => {
    it("adds a habit definition and toggles daily completion logs", () => {
        const item = newHabitItem();
        const habitId = addHabit(item, "Stretch", 1, NOW);

        toggleHabitLog(item, habitId, "2026-07-12", NOW);
        let rows = item.tableRows.toPlain(HABIT_COLUMNS);
        expect(rows).toHaveLength(2);
        const log = rows.find((r) => r.kind === "log")!;
        expect(log.habit_id).toBe(habitId);
        expect(log.date).toBe("2026-07-12");
        expect(log.created_at).toBe(NOW);

        // Toggling the same date removes the log again.
        toggleHabitLog(item, habitId, "2026-07-12", NOW);
        rows = item.tableRows.toPlain(HABIT_COLUMNS);
        expect(rows.filter((r) => r.kind === "log")).toHaveLength(0);
    });

    it("computes totals, done-today and streaks via SQL aggregation", async () => {
        const item = newHabitItem();
        const daily = addHabit(item, "Stretch", 1, NOW);
        const spaced = addHabit(item, "Gym", 3, NOW);

        for (const date of ["2026-07-10", "2026-07-11", "2026-07-12", "2026-07-05"]) {
            toggleHabitLog(item, daily, date, NOW);
        }
        // Every 3 days: gaps of <=3 days keep the streak alive.
        for (const date of ["2026-07-06", "2026-07-09", "2026-07-11"]) {
            toggleHabitLog(item, spaced, date, NOW);
        }

        const stats = await queryHabitStats(item, NOW);
        expect(stats.map((s) => s.name)).toEqual(["Stretch", "Gym"]);

        const stretch = stats[0];
        expect(stretch.total).toBe(4);
        expect(stretch.doneToday).toBe(true);
        expect(stretch.streak).toBe(3);
        expect(stretch.lastDate).toBe("2026-07-12");

        const gym = stats[1];
        expect(gym.total).toBe(3);
        expect(gym.doneToday).toBe(false);
        expect(gym.streak).toBe(3);
    });

    it("resets the streak when the last log is older than the interval", () => {
        expect(computeStreak(["2026-07-09", "2026-07-08"], 1, "2026-07-12")).toBe(0);
        expect(computeStreak(["2026-07-11", "2026-07-10", "2026-07-08"], 1, "2026-07-12")).toBe(2);
        expect(computeStreak([], 1, "2026-07-12")).toBe(0);
    });

    it("deletes a habit together with its logs", async () => {
        const item = newHabitItem();
        const keep = addHabit(item, "Keep", 1, NOW);
        const remove = addHabit(item, "Remove", 1, NOW);
        toggleHabitLog(item, remove, "2026-07-12", NOW);
        toggleHabitLog(item, keep, "2026-07-12", NOW);

        deleteHabit(item, remove);
        const rows = item.tableRows.toPlain(HABIT_COLUMNS);
        expect(rows.filter((r) => r.kind === "habit").map((r) => r.name)).toEqual(["Keep"]);
        expect(rows.filter((r) => r.kind === "log").map((r) => r.habit_id)).toEqual([keep]);
    });
});

describe("taskHabitService date helpers", () => {
    it("adds days across month boundaries preserving the time part", () => {
        expect(addDays("2026-07-30T09:30", 3)).toBe("2026-08-02T09:30");
        expect(addDays("2026-07-12", -1)).toBe("2026-07-11");
    });

    it("returns the last N calendar dates ending today", () => {
        expect(recentDates(3, "2026-07-12")).toEqual(["2026-07-10", "2026-07-11", "2026-07-12"]);
    });
});
