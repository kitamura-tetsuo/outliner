import { render } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Page from "./+page.svelte";

// Mock minimal dependencies
vi.mock("$app/stores", () => ({
    page: {
        subscribe: (fn: (val: { params: { page: string; }; }) => void) => {
            fn({ params: { page: "Test Page" } });
            return () => {};
        },
    },
}));

vi.mock("$lib/logger", () => ({
    getLogger: () => ({
        debug: vi.fn(),
        error: vi.fn(),
    }),
}));

vi.mock("../../../../services", () => ({
    acquireDemoClient: vi.fn(),
    releaseDemoClient: vi.fn(),
    removeYjsClientByProjectId: vi.fn(),
    exportItemToMarkdown: vi.fn(),
}));

vi.mock("../../../../lib/demoSeed", () => ({
    DEMO_PROJECT_NAME: "demo",
    seedDemo: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("Demo Diff Page", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should mount and show loading state initially", () => {
        const { getByText, unmount } = render(Page);
        expect(getByText("Loading Diff History...")).toBeTruthy();
        unmount();
    });
});
