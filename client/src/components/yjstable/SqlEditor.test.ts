import { render, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FOREIGN_EDITOR_ATTRIBUTE } from "../../lib/foreignEditor";
import { fakeMonacoRegistry } from "../../tests/mocks/fakeMonaco";
import SqlEditor from "./SqlEditor.svelte";

// The real editor needs layout, workers and a font stack that jsdom does not
// provide; the fake exposes the same surface plus type()/blur() hooks.
vi.mock("../../lib/monaco/monacoLoader", () => ({
    loadMonaco: () => import("../../tests/mocks/fakeMonaco").then((m) => m.fakeMonaco),
}));

// jsdom has no ResizeObserver; the editor uses one to re-layout on width changes.
const observed: HTMLElement[] = [];
let disconnectCount = 0;
class TestResizeObserver {
    observe(target: HTMLElement) {
        observed.push(target);
    }
    unobserve() {}
    disconnect() {
        disconnectCount += 1;
    }
}
(globalThis as Record<string, unknown>).ResizeObserver = TestResizeObserver;

const MULTILINE_SQL = "SELECT id, task_key\nFROM routine_occurrences r\nWHERE r.done = false";

/** Renders the editor and waits until the (fake) Monaco instance exists. */
async function renderEditor(props: Record<string, unknown> = {}) {
    const rendered = render(SqlEditor, { value: MULTILINE_SQL, testId: "sql", ...props });
    await waitFor(() => expect(fakeMonacoRegistry.editors.length).toBe(1));
    return rendered;
}

describe("SqlEditor", () => {
    beforeEach(() => {
        fakeMonacoRegistry.reset();
        observed.length = 0;
        disconnectCount = 0;
    });

    it("marks its root as an embedded editor that owns keyboard and clipboard events", async () => {
        const { getByTestId } = await renderEditor();
        const root = getByTestId("sql");
        expect(root.getAttribute(FOREIGN_EDITOR_ATTRIBUTE)).toBe("sql");
        expect(root.getAttribute("data-block-dnd-owner")).toBe("sql-editor");
    });

    it("shows the initial value in a SQL model, newlines intact", async () => {
        await renderEditor();
        const model = fakeMonacoRegistry.lastModel();
        expect(model.getValue()).toBe(MULTILINE_SQL);
        expect(model.language).toBe("sql");
    });

    it("reports the exact model text on change, including line breaks", async () => {
        const onChange = vi.fn();
        await renderEditor({ onChange });

        const edited = `${MULTILINE_SQL}\nORDER BY r.occurrence_date`;
        fakeMonacoRegistry.lastModel().type(edited);

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith(edited);
    });

    it("commits the exact model text when the editor loses focus", async () => {
        const onBlur = vi.fn();
        await renderEditor({ onBlur });

        const edited = MULTILINE_SQL.replace("SELECT id", "SELECT  id");
        fakeMonacoRegistry.lastModel().type(edited);
        fakeMonacoRegistry.lastEditor().blur();

        expect(onBlur).toHaveBeenCalledWith(edited);
        expect(edited).toContain("routine_occurrences r\nWHERE");
    });

    it("does not commit again when focus leaves without an edit", async () => {
        const onBlur = vi.fn();
        await renderEditor({ onBlur });

        fakeMonacoRegistry.lastEditor().blur();
        expect(onBlur).not.toHaveBeenCalled();
    });

    it("pushes an external value into the model without echoing it back as a change", async () => {
        const onChange = vi.fn();
        const { rerender } = await renderEditor({ onChange });

        const remote = "SELECT 1";
        await rerender({ value: remote, testId: "sql", onChange });

        expect(fakeMonacoRegistry.lastModel().getValue()).toBe(remote);
        expect(onChange).not.toHaveBeenCalled();
    });

    it("ignores the echo of its own change and keeps a single model", async () => {
        const onChange = vi.fn();
        const { rerender } = await renderEditor({ onChange });

        const edited = `${MULTILINE_SQL}\nLIMIT 10`;
        fakeMonacoRegistry.lastModel().type(edited);
        // What a parent does when it stores the draft it was just handed.
        await rerender({ value: edited, testId: "sql", onChange });

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(fakeMonacoRegistry.models.length).toBe(1);
        expect(fakeMonacoRegistry.lastModel().getValue()).toBe(edited);
    });

    it("disposes editor, model, listeners and the resize observer on destroy", async () => {
        const { unmount } = await renderEditor();
        const editor = fakeMonacoRegistry.lastEditor();
        const model = fakeMonacoRegistry.lastModel();
        expect(model.listenerCount).toBe(1);
        expect(observed).toHaveLength(1);

        unmount();

        expect(editor.disposed).toBe(true);
        expect(model.disposed).toBe(true);
        expect(model.listenerCount).toBe(0);
        expect(disconnectCount).toBe(1);
    });

    it("flushes pending text on destroy so a closed panel does not lose the edit", async () => {
        const onBlur = vi.fn();
        const { unmount } = await renderEditor({ onBlur });

        const edited = `${MULTILINE_SQL}\nLIMIT 5`;
        fakeMonacoRegistry.lastModel().type(edited);
        unmount();

        expect(onBlur).toHaveBeenCalledWith(edited);
    });

    it("keeps the editor height between minHeight and maxHeight", async () => {
        const { getByTestId } = await renderEditor({ minHeight: 100, maxHeight: 200 });
        const surface = getByTestId("sql").querySelector(".sql-editor-surface") as HTMLElement;

        fakeMonacoRegistry.lastEditor().reportContentHeight(40);
        await waitFor(() => expect(surface.style.height).toBe("100px"));

        fakeMonacoRegistry.lastEditor().reportContentHeight(4000);
        await waitFor(() => expect(surface.style.height).toBe("200px"));
    });
});
