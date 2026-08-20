import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedTableSchema, SchemaDiff } from "../../services/yjstable/schemaIntrospection";
import type { TableHandles } from "../../services/yjstable/tableDocs";
import type { TableSyncAdapter } from "../../services/yjstable/tableSyncAdapter";
import { fakeMonacoRegistry } from "../../tests/mocks/fakeMonaco";
import TableSchemaEditor from "./TableSchemaEditor.svelte";

// The schema editor renders the shared Monaco SQL editor; see SqlEditor.test.ts
// for why the runtime is faked under jsdom.
vi.mock("../../lib/monaco/monacoLoader", () => ({
    loadMonaco: () => import("../../tests/mocks/fakeMonaco").then((m) => m.fakeMonaco),
}));

const INITIAL_SCHEMA = "CREATE TABLE test (\n  id TEXT PRIMARY KEY,\n  note TEXT\n)";

function parsedSchema(createSql: string): ParsedTableSchema {
    return { tableName: "test", createSql, columns: [] };
}

function diff(overrides: Partial<SchemaDiff> = {}): SchemaDiff {
    return { addedColumns: [], removedColumns: [], typeChangedColumns: [], ...overrides };
}

describe("TableSchemaEditor", () => {
    let mockAdapter: TableSyncAdapter;
    let mockHandles: TableHandles;

    beforeEach(() => {
        fakeMonacoRegistry.reset();
        mockAdapter = {
            prepareSchemaChange: vi.fn(),
            applySchema: vi.fn(),
        } as unknown as TableSyncAdapter;

        mockHandles = {
            schemaText: { toString: () => INITIAL_SCHEMA },
        } as unknown as TableHandles;
    });

    async function renderEditor() {
        const rendered = render(TableSchemaEditor, { handles: mockHandles, adapter: mockAdapter });
        await waitFor(() => expect(fakeMonacoRegistry.editors.length).toBe(1));
        return rendered;
    }

    it("initialises the editor from the schema text, multiline intact", async () => {
        await renderEditor();
        expect(fakeMonacoRegistry.lastModel().getValue()).toBe(INITIAL_SCHEMA);
    });

    it("does not touch the adapter while the draft is edited", async () => {
        await renderEditor();

        // Typing and pasting both arrive as model content changes.
        fakeMonacoRegistry.lastModel().type(`${INITIAL_SCHEMA}\n-- pasted`);
        fakeMonacoRegistry.lastEditor().blur();

        expect(mockAdapter.prepareSchemaChange).not.toHaveBeenCalled();
        expect(mockAdapter.applySchema).not.toHaveBeenCalled();
    });

    it("applies the edited draft only when Apply schema is pressed", async () => {
        const edited = "CREATE TABLE test (\n  id TEXT PRIMARY KEY,\n  note TEXT,\n  extra TEXT\n)";
        const change = { parsed: parsedSchema(edited), diff: diff({ addedColumns: ["extra"] }) };
        vi.mocked(mockAdapter.prepareSchemaChange).mockResolvedValue(change);

        const { getByTestId } = await renderEditor();
        fakeMonacoRegistry.lastModel().type(edited);

        await fireEvent.click(getByTestId("yjs-table-schema-apply"));

        await waitFor(() => expect(mockAdapter.applySchema).toHaveBeenCalledWith(change.parsed));
        expect(mockAdapter.prepareSchemaChange).toHaveBeenCalledWith(edited);
    });

    it("asks for confirmation before a destructive change and applies only on confirm", async () => {
        const edited = "CREATE TABLE test (\n  id TEXT PRIMARY KEY\n)";
        const change = { parsed: parsedSchema(edited), diff: diff({ removedColumns: ["note"] }) };
        vi.mocked(mockAdapter.prepareSchemaChange).mockResolvedValue(change);

        const { getByTestId } = await renderEditor();
        fakeMonacoRegistry.lastModel().type(edited);

        await fireEvent.click(getByTestId("yjs-table-schema-apply"));

        const warning = await waitFor(() => getByTestId("yjs-table-schema-warning"));
        expect(warning.textContent).toContain("note");
        expect(mockAdapter.applySchema).not.toHaveBeenCalled();

        await fireEvent.click(getByTestId("yjs-table-schema-confirm"));
        await waitFor(() => expect(mockAdapter.applySchema).toHaveBeenCalledWith(change.parsed));
    });

    it("surfaces validation errors from Apply", async () => {
        vi.mocked(mockAdapter.prepareSchemaChange).mockRejectedValue(new Error('syntax error at or near "TABL"'));

        const { getByTestId } = await renderEditor();
        await fireEvent.click(getByTestId("yjs-table-schema-apply"));

        const error = await waitFor(() => getByTestId("yjs-table-schema-error"));
        expect(error.textContent).toContain("syntax error");
    });
});
