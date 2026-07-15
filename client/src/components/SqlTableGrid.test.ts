import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import { Item } from "../schema/app-schema";
import SqlTableGrid from "./SqlTableGrid.svelte";

describe("SqlTableGrid", () => {
    it("shows the SQL definition editor for an undefined table", () => {
        const item = new Item({ text: "grid" });
        render(SqlTableGrid, { item });
        expect(screen.getByLabelText("CREATE TABLE statement")).toBeInTheDocument();
        expect(screen.getByLabelText("Create table from SQL")).toBeInTheDocument();
    });

    it("renders an editable grid when columns are already defined", async () => {
        const item = new Item({ text: "grid" });
        item.defineTable("CREATE TABLE t (name TEXT, status TEXT)", ["name", "status"]);
        item.tableRows.addRow({ name: "Alice", status: "active" });

        render(SqlTableGrid, { item });

        await waitFor(() => {
            expect(screen.getByText("name")).toBeInTheDocument();
            expect(screen.getByText("status")).toBeInTheDocument();
            expect(screen.getByText("Alice")).toBeInTheDocument();
        });
    });

    it("adds a row and persists cell edits to the Yjs-backed item", async () => {
        const item = new Item({ text: "grid" });
        item.defineTable("CREATE TABLE t (name TEXT)", ["name"]);

        render(SqlTableGrid, { item });

        await fireEvent.click(screen.getByLabelText("Add row"));
        expect(item.tableRows.length).toBe(1);

        // Double-click the empty cell to edit, type a value, then commit.
        const cell = document.querySelector('td[data-col="name"]') as HTMLElement;
        await fireEvent.dblClick(cell);
        const input = cell.querySelector("input") as HTMLInputElement;
        await fireEvent.input(input, { target: { value: "Bob" } });
        await fireEvent.keyDown(input, { key: "Enter" });

        await waitFor(() => {
            expect(item.tableRows.toPlain(item.tableColumns)).toEqual([{ name: "Bob" }]);
        });
    });
});
