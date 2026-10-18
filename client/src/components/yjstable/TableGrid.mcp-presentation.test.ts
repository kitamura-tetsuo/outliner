// Saved presentation stays separate from SELECT eligibility and physical write authorization.
import { cleanup, fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    getGridHandles,
    readGridComponents,
    setGridComponentField,
    setGridQuery,
} from "../../services/yjstable/gridDocs";
import { resetPgliteForTests } from "../../services/yjstable/pgliteService";
import { resetTableEngineForTests } from "../../services/yjstable/tableEngine";
import { fakeMonacoRegistry } from "../../tests/mocks/fakeMonaco";
import { QUERY, setupSavedPresentation } from "./__fixtures__/mcpPresentation";
import ProjectGridView from "./ProjectGridView.svelte";

// Monaco's browser editor requires layout APIs absent from jsdom; SQL execution and mutations are real.
vi.mock("../../lib/monaco/monacoLoader", () => ({
    loadMonaco: () => import("../../tests/mocks/fakeMonaco").then(m => m.fakeMonaco),
}));

let fixture: ReturnType<typeof setupSavedPresentation>;
beforeEach(() => {
    fakeMonacoRegistry.reset();
    fixture = setupSavedPresentation();
});
afterEach(async () => {
    cleanup();
    fixture.projectDoc.destroy();
    await resetTableEngineForTests();
});
afterAll(async () => await resetPgliteForTests());

async function mount() {
    const view = render(ProjectGridView, { props: { grid: fixture.grid, projectDoc: fixture.projectDoc } });
    await waitFor(() => expect(view.container.querySelectorAll("tbody tr[data-record-id]")).toHaveLength(2), {
        timeout: 30000,
    });
    return view;
}
function cell(container: HTMLElement, id: string, column: string) {
    return container.querySelector(`td[data-record-id='${id}'][data-col='${column}']`)!;
}

describe("MCP-saved Grid presentation in the production runtime (#5436)", () => {
    it("round-trips Japanese labels, visibility, exact column identities and SQL row order in two placements", async () => {
        const first = await mount();
        const second = await mount();
        for (const { container } of [first, second]) {
            expect([...container.querySelectorAll("th[data-col] .th-label")].map(th => th.textContent?.trim()))
                .toEqual(["完了", "期限", "title"]);
            expect(container.querySelector("th[data-col='id']")).toBeNull();
            expect(container.querySelector("[data-col='期限']")).toBeNull();
            expect(container.querySelector("th[data-col='done']")).toHaveAttribute("title", "done");
            expect(container.querySelector("th[data-col='due_date']")).toHaveAttribute("title", "due_date");
            expect(
                [...container.querySelectorAll("tbody tr[data-record-id]")].map(row =>
                    row.getAttribute("data-record-id")
                ),
            )
                .toEqual(["r2", "r1"]);
            expect(
                [...container.querySelectorAll("tbody tr:first-child td[data-col]")].map(td =>
                    td.getAttribute("data-col")
                ),
            )
                .toEqual(["done", "due_date", "title"]);
        }
    });

    it("shows saved settings in the real definition editor under result names", async () => {
        const view = await mount();
        await fireEvent.click(view.getByTestId("yjs-table-toggle-ui"));
        expect(view.getByTestId("yjs-table-label-due_date")).toHaveValue("期限");
        expect(view.getByTestId("yjs-table-label-done")).toHaveValue("完了");
        expect(view.getByTestId("yjs-table-component-done")).toHaveValue("checkbox");
        expect(view.getByTestId("yjs-table-component-due_date")).toHaveValue("auto");
        expect(view.getByTestId("yjs-table-hidden-id")).not.toBeChecked();
        expect(view.getByTestId("yjs-table-hidden-due_date")).toBeChecked();
        expect([...view.container.querySelectorAll(".component-row")].map(row => row.getAttribute("data-col")))
            .toEqual(["done", "due_date", "id", "title"]);
    });

    it("uses current physical metadata when an explicit renderer is reset to automatic", async () => {
        const view = await mount();
        expect(cell(view.container, "r1", "done").querySelector("input[type='checkbox']")).not.toBeNull();
        expect(cell(view.container, "r1", "due_date").querySelector("input[type='date']")).toHaveValue("2026-10-31");
        setGridComponentField(fixture.grid, "done", "type", "text");
        await waitFor(() => expect(cell(view.container, "r1", "done").querySelector("button")).not.toBeNull());
        setGridComponentField(fixture.grid, "done", "type", undefined);
        await waitFor(() =>
            expect(cell(view.container, "r1", "done").querySelector("input[type='checkbox']")).toBeEnabled()
        );
    });

    it("honors Add and delete-confirmation settings without granting write authority", async () => {
        const view = await mount();
        expect(view.queryByTestId("yjs-table-add-row")).toBeNull();
        await fireEvent.click(view.getByRole("button", { name: /^Delete row r1$/ }));
        expect(view.container.textContent).toContain("Are you sure you want to delete row r1?");
        await fireEvent.click(view.getByText("Cancel", { selector: "button" }));
        expect(fixture.handles.data.get("r1")?.get("done")).toBe(false);
        expect(fixture.handles.data.size).toBe(2);
    });

    it("commits the second displayed row's relabeled checkbox to its physical record only", async () => {
        const view = await mount();
        const checkbox = cell(view.container, "r1", "done").querySelector<HTMLInputElement>("input[type='checkbox']")!;
        await waitFor(() => expect(checkbox).toBeEnabled());
        const before = fixture.handles.schemaText.toString();
        await fireEvent.focus(checkbox);
        await fireEvent.click(checkbox);
        await waitFor(() => expect(fixture.handles.data.get("r1")?.get("done")).toBe(true));
        expect(fixture.handles.data.get("r1")?.has("完了")).toBe(false);
        expect(fixture.handles.data.get("r1")?.get("title")).toBe("Write report");
        expect(fixture.handles.data.get("r2")?.toJSON()).toEqual({
            id: "r2",
            title: "Pay bills",
            due_date: "2026-11-30",
            done: true,
        });
        expect(fixture.handles.schemaText.toString()).toBe(before);
        expect(readGridComponents(getGridHandles(fixture.projectDoc, fixture.separateId)!)).toEqual(
            fixture.separateBefore,
        );
    });

    it("keeps DISTINCT results read-only using their own current producer evidence", async () => {
        setGridQuery(fixture.grid, QUERY.replace("SELECT ", "SELECT DISTINCT "));
        const before = fixture.handles.data.toJSON();
        const view = await mount();
        expect(view.getByTestId("grid-readonly-reason")).toBeVisible();
        for (const checkbox of view.container.querySelectorAll("td[data-col='done'] input")) {
            expect(checkbox).toBeDisabled();
        }
        expect(fixture.handles.data.toJSON()).toEqual(before);
        expect(readGridComponents(fixture.grid).labels).toMatchObject({ done: "完了", due_date: "期限" });
    });
});
