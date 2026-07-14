import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import { Item } from "../schema/app-schema";
import { addHabit, HABIT_COLUMNS, HABIT_TABLE_DDL, localDate, toggleHabitLog } from "../services/taskHabitService";
import HabitTracker from "./HabitTracker.svelte";

describe("HabitTracker", () => {
    it("defines the habit table on mount and shows the empty state", async () => {
        const item = new Item({ text: "habits" });
        render(HabitTracker, { item });

        await waitFor(() => {
            expect(item.tableSchema).toBe(HABIT_TABLE_DDL);
            expect(screen.getByText("No habits yet. Add one above.")).toBeInTheDocument();
        });
    });

    it("adds a habit from the form with its repeat interval", async () => {
        const item = new Item({ text: "habits" });
        render(HabitTracker, { item });

        await fireEvent.input(screen.getByLabelText("Habit name"), { target: { value: "Read" } });
        await fireEvent.input(screen.getByLabelText("Habit interval in days"), { target: { value: "2" } });
        await fireEvent.submit(screen.getByLabelText("Habit name").closest("form")!);

        await waitFor(() => {
            expect(screen.getByText("Read")).toBeInTheDocument();
        });
        const rows = item.tableRows.toPlain(HABIT_COLUMNS);
        expect(rows).toHaveLength(1);
        expect(rows[0].kind).toBe("habit");
        expect(rows[0].interval_days).toBe("2");
    });

    it("toggles today's completion and updates the streak", async () => {
        const item = new Item({ text: "habits" });
        render(HabitTracker, { item });
        await waitFor(() => expect(item.tableSchema).toBe(HABIT_TABLE_DDL));

        const habitId = addHabit(item, "Stretch", 1);
        const today = localDate();

        const toggle = await screen.findByLabelText(`Toggle Stretch on ${today}`);
        await fireEvent.click(toggle);

        await waitFor(() => {
            const logs = item.tableRows.toPlain(HABIT_COLUMNS).filter((r) => r.kind === "log");
            expect(logs).toHaveLength(1);
            expect(logs[0].habit_id).toBe(habitId);
            expect(logs[0].date).toBe(today);
        });
        await waitFor(() => {
            expect(screen.getByTestId("habit-streak")).toHaveTextContent("🔥 1");
        });
    });

    it("renders seeded logs across the recent-days grid", async () => {
        const item = new Item({ text: "habits" });
        render(HabitTracker, { item });
        await waitFor(() => expect(item.tableSchema).toBe(HABIT_TABLE_DDL));

        const habitId = addHabit(item, "Run", 1);
        const today = localDate();
        toggleHabitLog(item, habitId, today);

        await waitFor(() => {
            const toggle = screen.getByLabelText(`Toggle Run on ${today}`);
            expect(toggle).toHaveAttribute("aria-pressed", "true");
        });
    });
});
