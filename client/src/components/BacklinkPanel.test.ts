import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BacklinkPanel from "./BacklinkPanel.svelte";

// Mock dependencies
vi.mock("$app/navigation", () => ({
    goto: vi.fn(),
}));

vi.mock("$app/paths", () => ({
    resolve: (path: string) => path,
}));

vi.mock("$lib/backlinkCollector", () => ({
    collectBacklinks: vi.fn(() => [
        {
            sourcePageId: "page-1",
            sourcePageName: "Source Page",
            context: "Link to [[Target Page]]",
        },
    ]),
}));

vi.mock("$lib/logger", () => ({
    getLogger: () => ({
        info: vi.fn(),
        error: vi.fn(),
    }),
}));

vi.mock("../utils/linkHighlighter", () => ({
    highlightLinkInContext: (text: string) => text,
}));

describe("BacklinkPanel Accessibility", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should have correct ARIA attributes on toggle button", async () => {
        render(BacklinkPanel, { pageName: "Target Page" });

        const toggleButton = screen.getByRole("button", { name: /Backlinks/i }); // Matches text content or aria-label

        // Initial state (collapsed)
        expect(toggleButton).toHaveAttribute("aria-expanded", "false");

        // Check for aria-controls (should fail initially)
        expect(toggleButton).toHaveAttribute("aria-controls", "backlink-content-panel");
    });

    it("should have correct accessible structure when expanded", async () => {
        render(BacklinkPanel, { pageName: "Target Page" });

        const toggleButton = screen.getByRole("button", { name: /Backlinks/i });
        await fireEvent.click(toggleButton);

        // Should be expanded
        expect(toggleButton).toHaveAttribute("aria-expanded", "true");

        // Content panel should exist and have accessible roles (should fail initially)
        const contentPanel = document.getElementById("backlink-content-panel");
        expect(contentPanel).toBeInTheDocument();
        expect(contentPanel).toHaveAttribute("role", "region");
        expect(contentPanel).toHaveAttribute("aria-label", "Backlinks");

        // Refresh button should have aria-label (should fail initially)
        const refreshButton = screen.getByTitle("Reload");
        expect(refreshButton).toHaveAttribute("aria-label", "Reload backlinks");
    });
});
