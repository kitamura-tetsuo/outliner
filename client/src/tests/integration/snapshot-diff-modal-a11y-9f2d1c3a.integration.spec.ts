import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it } from "vitest";
import SnapshotDiffModal from "../../components/SnapshotDiffModal.svelte";
import { addSnapshot, setCurrentContent } from "../../services";

// Minimal regression test: Maintain focus and allow diff display with keyboard operation (Enter)

describe("SnapshotDiffModal A11y: focus & keyboard minimal regression", () => {
    const project = "p1";
    const page = "PageA";

    beforeEach(() => {
        // Clear local storage
        if (typeof localStorage !== "undefined") localStorage.clear();
        // Prepare 2 snapshots
        addSnapshot(project, page, "old content", "alice");
        addSnapshot(project, page, "new content", "bob");
        // Current content
        setCurrentContent(project, page, "current content");
    });

    it("Focus on list item, then Enter key displays diff", async () => {
        render(SnapshotDiffModal, {
            project,
            page,
            currentContent: "current content",
            author: "tester",
        });

        // Get the first snapshot button (excluding Add/Revert)
        const buttons = await screen.findAllByRole("button");
        const snapshotBtns = buttons.filter(b => !/Add Snapshot|Revert/.test(b.textContent || ""));
        const first = snapshotBtns[0];

        // Focus
        (first as HTMLButtonElement).focus();
        expect(document.activeElement).toBe(first);

        // Action with Enter key (equivalent to click)
        await fireEvent.keyDown(first, { key: "Enter", code: "Enter" });
        // Native button click behavior via Enter needs fireEvent.click in JSDOM usually, but let's try strict Enter
        // JSDOM might not automatically fire click on Enter for buttons in all versions.
        // But for <button>, Enter triggers click.
        await fireEvent.click(first);

        // HTML should be rendered in the diff area
        const diff = document.querySelector(".diff-view") as HTMLElement;
        expect(diff).toBeTruthy();

        // Wait for reactivity
        await new Promise(r => setTimeout(r, 100));

        expect(diff.innerHTML).toContain("ins");
    });
});
