import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SnapshotDiffModal from "../../components/SnapshotDiffModal.svelte";

// Mock services (limited mocking allowed for unit/integration tests)
vi.mock("../../services", () => {
    const now = Date.now();
    const data = [{ id: "s1", timestamp: now - 1000, author: "user1", content: "old" }];
    return {
        listSnapshots: () => data,
        getSnapshot: (_project: string, _page: string, id: string) => data.find(d => d.id === id) ?? null,
        addSnapshot: vi.fn(),
        replaceWithSnapshot: vi.fn((_project: string, _page: string, id: string) => ({
            id,
            timestamp: now,
            author: "user1",
            content: "old",
        })),
    };
});

describe("HDV: SnapshotDiffModal a11y - li does not have onclick", () => {
    beforeEach(() => {
        // Since the window type may not match the runtime in JSDOM/Testing Library,
        // subsequent use of (window as any) is a safe relaxation due to Playwright/JSDOM type ambiguity.
    });

    it("Snapshot selection works by clicking button, and li does not have onclick", async () => {
        render(SnapshotDiffModal, {
            project: "p",
            page: "pg",
            currentContent: "new",
            author: "user",
        });

        // List item (li) does not have onclick set
        const items = await screen.findAllByRole("listitem");
        expect(items.length).toBeGreaterThan(0);
        for (const li of items) {
            expect(li.getAttribute("onclick")).toBeNull();
        }

        // Diff is displayed on button click (ins or del is rendered)
        const buttons = await screen.findAllByRole("button");
        const target = buttons.find(b => /user1/.test(b.textContent || "")) || buttons[0];
        await fireEvent.click(target);

        // Confirm diff is rendered
        // NOTE: diff-prettyHtml uses <ins>/<del>
        const diffInserted = document.querySelector(".diff ins, .diff del");
        expect(diffInserted).not.toBeNull();
    });
});
