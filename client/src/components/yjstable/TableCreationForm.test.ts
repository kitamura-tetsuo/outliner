/** @vitest-environment jsdom */
import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import TableCreationForm from "./TableCreationForm.svelte";

describe("TableCreationForm", () => {
    it("defaults to Tasks and submits its resolved display and SQL names", async () => {
        const oncreate = vi.fn(() => undefined);
        const rendered = render(TableCreationForm, { takenSqlNames: [], oncreate });

        expect((rendered.getByTestId("yjs-table-preset-select") as HTMLSelectElement).value).toBe("tasks");
        expect((rendered.getByTestId("yjs-table-sql-name-input") as HTMLInputElement).value).toBe("tasks");
        await fireEvent.submit(rendered.getByTestId("table-creation-form"));

        expect(oncreate).toHaveBeenCalledOnce();
        expect(oncreate.mock.calls[0][0]).toMatchObject({ name: "Tasks", sqlName: "tasks" });
        expect(oncreate.mock.calls[0][0].preset.key).toBe("tasks");
    });

    it("keeps a manual SQL name through display-name and preset changes", async () => {
        const oncreate = vi.fn(() => undefined);
        const rendered = render(TableCreationForm, { takenSqlNames: [], oncreate });
        const sqlInput = rendered.getByTestId("yjs-table-sql-name-input") as HTMLInputElement;

        await fireEvent.input(sqlInput, { target: { value: "manual_relation" } });
        await fireEvent.input(rendered.getByTestId("yjs-table-name-input"), { target: { value: "Renamed" } });
        await fireEvent.change(rendered.getByTestId("yjs-table-preset-select"), { target: { value: "habits" } });

        expect(sqlInput.value).toBe("manual_relation");
        await fireEvent.submit(rendered.getByTestId("table-creation-form"));
        expect(oncreate.mock.calls[0][0]).toMatchObject({
            name: "Renamed",
            sqlName: "manual_relation",
            preset: { key: "habits" },
        });
    });

    it("shows validation and callback errors without reporting creation", async () => {
        const oncreate = vi.fn(() => "SQL name was claimed before submission");
        const rendered = render(TableCreationForm, { takenSqlNames: [], oncreate });
        const sqlInput = rendered.getByTestId("yjs-table-sql-name-input");

        await fireEvent.input(sqlInput, { target: { value: "order" } });
        await fireEvent.submit(rendered.getByTestId("table-creation-form"));
        expect(rendered.getByTestId("yjs-table-create-error").textContent).toContain("reserved");
        expect(oncreate).not.toHaveBeenCalled();

        await fireEvent.input(sqlInput, { target: { value: "valid_name" } });
        await fireEvent.submit(rendered.getByTestId("table-creation-form"));
        expect(rendered.getByTestId("yjs-table-create-error").textContent).toContain("claimed");
        expect(oncreate).toHaveBeenCalledOnce();
    });
});
