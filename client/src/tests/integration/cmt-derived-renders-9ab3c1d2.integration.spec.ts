import { render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import CommentThread from "../../components/CommentThread.svelte";
import { Item } from "../../schema/app-schema";

// Minimal stub for missing APIs such as Clipboard / ResizeObserver in jsdom
class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}
(globalThis as Record<string, unknown>).ResizeObserver = ResizeObserver;

/**
 * CMT-0001 Lightweight integration test verifying that re-rendering occurs solely through derived state
 * - Updating the Yjs side (Item.comments) reflects in the comment count display of CommentThread
 * - UI updates via minimal granularity Yjs observe + $derived, without depending on $effect
 */
describe("cmt-derived-renders", () => {
    it("updates renderCommentsState length when Yjs comments change", async () => {
        const item = new Item({ text: "" });

        render(CommentThread, {
            comments: item.comments,
            currentUser: "me",
            doc: item.ydoc,
        });

        // Initially 0 items
        const counter = await screen.findByText(/\b0\b/, { selector: ".thread-comment-count" });
        expect(counter).toBeTruthy();

        // Add comment via Yjs
        item.addComment("me", "hello");

        // Wait for comment count to change to 1 (verify propagation via derived state only)
        await waitFor(async () => {
            const el = await screen.findByText(/\b1\b/, { selector: ".thread-comment-count" });
            expect(el).toBeTruthy();
        });
    });
});
