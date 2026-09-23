import { fireEvent, render } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import CalendarEntryContextMenu from "./CalendarEntryContextMenu.svelte";

describe("CalendarEntryContextMenu", () => {
    it("renders the context menu with the delete button", () => {
        const { getByTestId, getByRole } = render(CalendarEntryContextMenu, {
            props: {
                x: 100,
                y: 100,
                entryTitle: "Test Entry",
                onDelete: vi.fn(),
                onClose: vi.fn(),
            },
        });

        expect(getByTestId("calendar-entry-context-menu")).toBeTruthy();
        expect(getByTestId("calendar-entry-context-delete")).toBeTruthy();
        expect(getByRole("menu", { name: "Actions for Test Entry" })).toBeTruthy();
    });

    it("calls onDelete and onClose when delete is clicked", async () => {
        const onDelete = vi.fn();
        const onClose = vi.fn();
        const { getByTestId } = render(CalendarEntryContextMenu, {
            props: { x: 10, y: 10, entryTitle: "Item", onDelete, onClose },
        });

        await fireEvent.click(getByTestId("calendar-entry-context-delete"));
        expect(onDelete).toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
    });

    it("calls onClose when the overlay is clicked", async () => {
        const onClose = vi.fn();
        const { getByRole } = render(CalendarEntryContextMenu, {
            props: { x: 10, y: 10, entryTitle: "Item", onDelete: vi.fn(), onClose },
        });

        const overlay = getByRole("presentation");
        await fireEvent.click(overlay);
        expect(onClose).toHaveBeenCalled();
    });

    it("calls onClose when Escape is pressed", async () => {
        const onClose = vi.fn();
        render(CalendarEntryContextMenu, {
            props: { x: 10, y: 10, entryTitle: "Item", onDelete: vi.fn(), onClose },
        });

        await fireEvent.keyDown(window, { key: "Escape" });
        expect(onClose).toHaveBeenCalled();
    });
});
