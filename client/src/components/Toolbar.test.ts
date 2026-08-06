import { fireEvent, render } from "@testing-library/svelte";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { globalUndoRouter } from "../services/undo/undoRouter.svelte";
import Toolbar from "./Toolbar.svelte";

beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
});

describe("Toolbar", () => {
    test("renders undo/redo buttons in desktop toolbar and binds disabled state correctly", () => {
        const { getByTestId, getByLabelText } = render(Toolbar);

        const undoBtn = getByTestId("toolbar-undo");
        const redoBtn = getByTestId("toolbar-redo");

        expect(undoBtn).toBeTruthy();
        expect(redoBtn).toBeTruthy();

        // Testing disabled bindings based on global router mock
        expect((undoBtn as HTMLButtonElement).disabled).toBe(true);
        expect((redoBtn as HTMLButtonElement).disabled).toBe(true);
    });
});
