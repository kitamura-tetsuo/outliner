import { cleanup, fireEvent, render, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PasteSpecialDialog from "./PasteSpecialDialog.svelte";

const choices = [
    {
        variant: "another-view" as const,
        label: "Another view",
        description: "Share component data.",
        available: false,
        reason: "The source component belongs to another project",
        isDefault: false,
    },
    {
        variant: "copy-with-data" as const,
        label: "Independent copy with data",
        description: "Copy component data once.",
        available: true,
        isDefault: true,
    },
];

// jsdom does not implement HTMLDialogElement.showModal, so the component's
// guarded `dialog.showModal()` call is skipped and the dialog stays closed.
// Install the missing platform opening semantics before mounting so the real
// open-then-focus sequence runs. This stubs no application logic and focuses
// nothing itself: the component performs the focus after opening.
const showModalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
        value: function(this: HTMLDialogElement) {
            if (this.open) throw new DOMException("The dialog is already open.", "InvalidStateError");
            this.setAttribute("open", "");
        },
        writable: true,
        configurable: true,
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
        value: function(this: HTMLDialogElement) {
            this.removeAttribute("open");
        },
        writable: true,
        configurable: true,
    });
});

afterEach(() => {
    cleanup();
    if (showModalDescriptor) {
        Object.defineProperty(HTMLDialogElement.prototype, "showModal", showModalDescriptor);
    } else {
        delete (HTMLDialogElement.prototype as { showModal?: unknown; }).showModal;
    }
    if (closeDescriptor) {
        Object.defineProperty(HTMLDialogElement.prototype, "close", closeDescriptor);
    } else {
        delete (HTMLDialogElement.prototype as { close?: unknown; }).close;
    }
});

describe("PasteSpecialDialog", () => {
    it("keeps an unavailable choice visible with its reason and focuses the first available choice once open", async () => {
        const { getByTestId } = render(PasteSpecialDialog, { choices, onchoose: vi.fn() });
        const dialog = getByTestId("paste-special-dialog") as HTMLDialogElement;
        const unavailable = getByTestId("paste-special-another-view") as HTMLButtonElement;
        const available = getByTestId("paste-special-copy-with-data") as HTMLButtonElement;

        expect(unavailable.disabled).toBe(true);
        expect(unavailable).toBeVisible();
        const reason = unavailable.querySelector("#another-view-description") as HTMLElement | null;
        expect(reason).not.toBeNull();
        expect(reason as HTMLElement).toBeVisible();
        expect((reason as HTMLElement).textContent).toContain("The source component belongs to another project");
        await waitFor(() => {
            // A closed dialog (or body focus) must not count as success.
            expect(dialog.open).toBe(true);
            expect(document.activeElement).toBe(available);
        });
        expect(document.activeElement).not.toBe(document.body);
        expect(available).toHaveFocus();
    });

    it("returns the chosen variant", async () => {
        const onchoose = vi.fn();
        const { getByTestId } = render(PasteSpecialDialog, { choices, onchoose });

        await fireEvent.click(getByTestId("paste-special-copy-with-data"));

        expect(onchoose).toHaveBeenCalledWith("copy-with-data");
    });

    it("cancels on Escape", async () => {
        const onchoose = vi.fn();
        const { getByTestId } = render(PasteSpecialDialog, { choices, onchoose });

        const dialog = getByTestId("paste-special-dialog");
        await fireEvent(dialog, new Event("cancel"));

        expect(onchoose).toHaveBeenCalledWith(undefined);
    });

    it("opens and focuses correctly on repeated mounts without stale platform state", async () => {
        for (let mount = 0; mount < 2; mount += 1) {
            const { getByTestId } = render(PasteSpecialDialog, { choices, onchoose: vi.fn() });
            const dialog = getByTestId("paste-special-dialog") as HTMLDialogElement;
            const available = getByTestId("paste-special-copy-with-data") as HTMLButtonElement;

            await waitFor(() => {
                expect(dialog.open).toBe(true);
                expect(document.activeElement).toBe(available);
            });
            cleanup();
            expect(document.querySelector('[data-testid="paste-special-dialog"]')).toBeNull();
        }
        expect(typeof HTMLDialogElement.prototype.showModal).toBe("function");
    });
});
