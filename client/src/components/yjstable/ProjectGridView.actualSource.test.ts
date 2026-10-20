import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, expect, it } from "vitest";
import * as Y from "yjs";
import { createGrid, getGridHandles, setGridQuery } from "../../services/yjstable/gridDocs";
import { resetPgliteForTests } from "../../services/yjstable/pgliteService";
import { addRecord, createTable, getTableHandles, setSchemaText } from "../../services/yjstable/tableDocs";
import { resetTableEngineForTests } from "../../services/yjstable/tableEngine";
import ProjectGridView from "./ProjectGridView.svelte";

afterEach(async () => await resetTableEngineForTests());
afterAll(async () => await resetPgliteForTests());

it("renders source-specific UNION choices and routes its verified branch edit", { timeout: 60000 }, async () => {
    const projectDoc = new Y.Doc({ guid: "grid-branch-metadata" });
    const sources = ["a", "b"].map(name => {
        const handles = getTableHandles(projectDoc, createTable(projectDoc, name, name))!;
        setSchemaText(
            handles,
            `CREATE TABLE ${name} (id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK (status IN ('${name}_open', '${name}_done')))`,
        );
        addRecord(handles, { status: `${name}_open` }, "same");
        return handles;
    });
    const query =
        "SELECT 'a' AS source_kind, id AS source_id, status AS status FROM a UNION ALL SELECT 'b' AS source_kind, id AS source_id, status AS status FROM b";
    const grid = getGridHandles(projectDoc, createGrid(projectDoc, undefined, { name: "Independent", query }))!;
    const view = render(ProjectGridView, { props: { grid, projectDoc, projectName: "Project" } });
    await waitFor(() => expect(view.container.querySelectorAll("td select")).toHaveLength(2), { timeout: 30000 });
    const selects = view.container.querySelectorAll<HTMLSelectElement>("td select");
    expect(Array.from(selects[0].options).filter(option => option.textContent).map(option => option.value)).toEqual([
        "a_open",
        "a_done",
    ]);
    expect(Array.from(selects[1].options).filter(option => option.textContent).map(option => option.value)).toEqual([
        "b_open",
        "b_done",
    ]);
    await fireEvent.pointerDown(selects[1]);
    await fireEvent.change(selects[1], { target: { value: "b_done" } });
    await waitFor(() => expect(sources[1].data.get("same")?.get("status")).toBe("b_done"));
    expect(sources[0].data.get("same")?.get("status")).toBe("a_open");
    expect(view.getByTestId("yjs-table-name")).toHaveTextContent("Independent");
    await waitFor(() => expect(view.getByTestId("grid-query-dependencies").querySelectorAll("a")).toHaveLength(2));
    await fireEvent.click(view.getByTestId("yjs-table-add-row"));
    await waitFor(() =>
        expect(view.getByTestId("yjs-grid-insert-status")).toHaveTextContent(/select|choose|ambiguous/i)
    );
    expect(sources.map(source => source.data.size)).toEqual([1, 1]);
    view.unmount();
    projectDoc.destroy();
});

it("keeps zero-Table computed results in the rich Grid and clears dependencies", { timeout: 60000 }, async () => {
    const projectDoc = new Y.Doc({ guid: "grid-no-tables" });
    const grid = getGridHandles(
        projectDoc,
        createGrid(projectDoc, undefined, { name: "Numbers", query: "SELECT 42 AS value, true AS flag" }),
    )!;
    const view = render(ProjectGridView, { props: { grid, projectDoc } });
    await waitFor(() => expect(view.getByTestId("yjs-table-grid").textContent).toContain("42"), { timeout: 30000 });
    expect(view.getByTestId("yjs-table-name")).toHaveTextContent("Numbers");
    await waitFor(() =>
        expect(view.container.querySelector('td[data-col="flag"] input[type="checkbox"]')).toBeTruthy()
    );
    expect(view.getByTestId("grid-query-dependencies")).toHaveTextContent("No project Table dependencies");
    expect(projectDoc.getMap("yjsTables").size).toBe(0);
    setGridQuery(grid, "SELECT broken AS broken FROM missing_table");
    await waitFor(() => expect(view.getByTestId("yjs-table-query-error")).toBeTruthy());
    expect(view.getByTestId("yjs-table-toggle-ui")).toBeTruthy();
    view.unmount();
    projectDoc.destroy();
});

it(
    "retains choice metadata for repeated occurrences of the same physical UNION field",
    { timeout: 60000 },
    async () => {
        const projectDoc = new Y.Doc({ guid: "grid-repeated-field" });
        const table = getTableHandles(projectDoc, createTable(projectDoc, "A", "a"))!;
        setSchemaText(
            table,
            "CREATE TABLE a (id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK (status IN ('open', 'done')))",
        );
        addRecord(table, { status: "open" }, "same");
        const branch = "SELECT 'a' AS source_kind, id AS source_id, status AS status FROM a";
        const grid = getGridHandles(
            projectDoc,
            createGrid(projectDoc, undefined, { query: `${branch} UNION ALL ${branch}` }),
        )!;
        const view = render(ProjectGridView, { props: { grid, projectDoc } });
        try {
            await waitFor(() => expect(view.container.querySelectorAll("tbody tr")).toHaveLength(2), {
                timeout: 30000,
            });
            await waitFor(() =>
                expect(view.container.querySelectorAll<HTMLSelectElement>('td[data-col="status"] select')).toHaveLength(
                    2,
                )
            );
            const choices = view.container.querySelectorAll<HTMLSelectElement>('td[data-col="status"] select');
            expect(choices).toHaveLength(2);
            for (const choice of choices) {
                expect(
                    Array.from(choice.options).filter(option => option.textContent).map(option => option.value),
                ).toEqual(["open", "done"]);
            }
        } finally {
            view.unmount();
            projectDoc.destroy();
        }
    },
);
