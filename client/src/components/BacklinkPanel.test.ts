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

describe("BacklinkPanel Basic", () => {
    it("should mount without errors", () => {
        const { container } = render(BacklinkPanel, { pageName: "Target Page" });
        expect(container).toBeTruthy();
    });
});
