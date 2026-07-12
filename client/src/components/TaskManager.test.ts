import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import { Item } from "../schema/app-schema";
import { addTask, TASK_COLUMNS, TASK_TABLE_DDL } from "../services/taskHabitService";
import TaskManager from "./TaskManager.svelte";

describe("TaskManager", () => {
    it("defines the task table on mount and shows the empty state", async () => {
        const item = new Item({ text: "tasks" });
        render(TaskManager, { item });

        await waitFor(() => {
            expect(item.tableSchema).toBe(TASK_TABLE_DDL);
            expect(screen.getByText("No tasks in this view.")).toBeInTheDocument();
        });
    });

    it("adds a task from the form and records the registration time", async () => {
        const item = new Item({ text: "tasks" });
        render(TaskManager, { item });

        await fireEvent.input(screen.getByLabelText("Task title"), { target: { value: "Buy milk" } });
        await fireEvent.submit(screen.getByLabelText("Task title").closest("form")!);

        await waitFor(() => {
            expect(screen.getByText("Buy milk")).toBeInTheDocument();
        });
        const rows = item.tableRows.toPlain(TASK_COLUMNS);
        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe("open");
        expect(rows[0].created_at).not.toBe("");
    });

    it("completes a task via its checkbox and shows it in the Completed view", async () => {
        const item = new Item({ text: "tasks" });
        render(TaskManager, { item });
        await waitFor(() => expect(item.tableSchema).toBe(TASK_TABLE_DDL));
        addTask(item, { title: "Ship feature" });

        await waitFor(() => expect(screen.getByText("Ship feature")).toBeInTheDocument());
        await fireEvent.click(screen.getByLabelText("Complete Ship feature"));

        await waitFor(() => {
            const rows = item.tableRows.toPlain(TASK_COLUMNS);
            expect(rows[0].status).toBe("done");
            expect(rows[0].completed_at).not.toBe("");
        });

        await fireEvent.click(screen.getByRole("tab", { name: /Completed/ }));
        await waitFor(() => {
            expect(screen.getByText("Ship feature")).toBeInTheDocument();
        });
    });

    it("does not clobber an existing foreign table without confirmation", async () => {
        const item = new Item({ text: "tasks" });
        item.defineTable("CREATE TABLE other (id TEXT)", ["id"]);
        render(TaskManager, { item });

        const convert = await screen.findByLabelText("Replace table with task table");
        expect(item.tableSchema).toBe("CREATE TABLE other (id TEXT)");
        await fireEvent.click(convert);
        expect(item.tableSchema).toBe(TASK_TABLE_DDL);
    });
});
