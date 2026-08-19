import { fireEvent, render } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TableSchemaEditor from "./TableSchemaEditor.svelte";

describe("TableSchemaEditor", () => {
    let mockAdapter: any;
    let mockHandles: any;

    beforeEach(() => {
        mockAdapter = {
            prepareSchemaChange: vi.fn(),
            applySchema: vi.fn(),
        };

        mockHandles = {
            schemaText: { toString: () => "CREATE TABLE test (id TEXT PRIMARY KEY)" },
        };
    });

    it("handles paste without applying schema", async () => {
        const { getByTestId } = render(TableSchemaEditor, { handles: mockHandles, adapter: mockAdapter });

        const textarea = getByTestId("yjs-table-schema-input") as HTMLTextAreaElement;

        await fireEvent.paste(textarea, {
            clipboardData: {
                getData: (format: string) => format === "text/plain" ? "pasted_table" : "",
            },
        });

        // Adapter should not be called merely on paste
        expect(mockAdapter.prepareSchemaChange).not.toHaveBeenCalled();
        expect(mockAdapter.applySchema).not.toHaveBeenCalled();
    });
});
