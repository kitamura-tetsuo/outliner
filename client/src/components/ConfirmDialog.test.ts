import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConfirmDialog from "./ConfirmDialog.svelte";
import ConfirmDialogWrapper from "./ConfirmDialogWrapper.test.svelte";

describe("ConfirmDialog", () => {
    let onConfirm: () => void;
    let onCancel: () => void;

    beforeEach(() => {
        onConfirm = vi.fn();
        onCancel = vi.fn();
        HTMLDialogElement.prototype.showModal = vi.fn();
        HTMLDialogElement.prototype.close = vi.fn();
    });

    afterEach(() => {
        cleanup();
    });

    it("confirm invokes onConfirm exactly once and onCancel zero times", async () => {
        const { getByText } = render(ConfirmDialog, {
            isOpen: true,
            onConfirm,
            onCancel,
        });

        const confirmButton = getByText("Confirm", { selector: "button" });
        await fireEvent.click(confirmButton);

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onCancel).toHaveBeenCalledTimes(0);
    });

    it("cancel invokes only onCancel", async () => {
        const { getByText } = render(ConfirmDialog, {
            isOpen: true,
            onConfirm,
            onCancel,
        });

        const cancelButton = getByText("Cancel", { selector: "button" });
        await fireEvent.click(cancelButton);

        expect(onConfirm).toHaveBeenCalledTimes(0);
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("isOpen updates when buttons are clicked (wrapper test)", async () => {
        const { getByText, getByTestId, unmount } = render(ConfirmDialogWrapper, {
            isOpen: true,
            onConfirm: vi.fn(),
            onCancel: vi.fn(),
        });

        const cancelButton = getByText("Cancel", { selector: "button" });
        await fireEvent.click(cancelButton);

        expect(getByTestId("is-open").textContent).toBe("false");

        unmount();

        // Re-render and test confirm button
        const { getByText: getByText2, getByTestId: getByTestId2 } = render(ConfirmDialogWrapper, {
            isOpen: true,
            onConfirm: vi.fn(),
            onCancel: vi.fn(),
        });

        const confirmButton = getByText2("Confirm", { selector: "button" });
        await fireEvent.click(confirmButton);

        expect(getByTestId2("is-open").textContent).toBe("false");
    });

    it("Escape behaves as cancel", async () => {
        const { container } = render(ConfirmDialog, {
            isOpen: true,
            onConfirm,
            onCancel,
        });

        const dialog = container.querySelector("dialog");
        if (dialog) {
            const cancelEvent = new Event("cancel");
            await fireEvent(dialog, cancelEvent);
        }

        expect(onConfirm).toHaveBeenCalledTimes(0);
        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});
