import {
    fireEvent,
    render,
} from "@testing-library/svelte";
import {
    describe,
    expect,
    it,
    vi,
} from "vitest";
import EditableQueryGrid from "../components/EditableQueryGrid.svelte";

describe("EditableQueryGrid", () => {
    it("emits edit event when cell is changed", async () => {
        const columns = ["id", "name"];
        const rows = [["1", "a"]];
        const mockOnEdit = vi.fn();
        const { getByDisplayValue } = render(EditableQueryGrid, {
            columns,
            rows,
            onedit: mockOnEdit,
        });
        const input = getByDisplayValue("a") as HTMLInputElement;
        await fireEvent.change(input, { target: { value: "b" } });
        expect(mockOnEdit).toHaveBeenCalledWith(
            expect.objectContaining({
                detail: { rowIndex: 0, colIndex: 1, value: "b" },
            }),
        );
    });

    it("shows readonly cells as span", () => {
        const columns = ["id", "name"];
        const rows = [["1", "a"]];
        const { container } = render(EditableQueryGrid, { columns, rows, readonlyColumns: ["id"] });
        const firstCell = container.querySelector("tbody tr td");
        expect(firstCell?.querySelector("span")?.textContent).toBe("1");
    });
});
