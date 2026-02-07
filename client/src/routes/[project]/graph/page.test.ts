import { render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import Page from "./+page.svelte";

// Mock echarts used by GraphView
vi.mock("echarts", () => ({
    init: () => ({
        setOption: vi.fn(),
        on: vi.fn(),
        resize: vi.fn(),
        dispose: vi.fn(),
        convertFromPixel: vi.fn(),
        getOption: () => ({ series: [] }),
    }),
}));

// Mock navigation
vi.mock("$app/navigation", () => ({
    goto: vi.fn(),
}));

vi.mock("$app/paths", () => ({
    resolve: (path: string) => path,
}));

// Mock stores if necessary. GraphView uses some stores.
vi.mock("../../../services", () => ({
    getYjsClientByProjectTitle: vi.fn().mockResolvedValue({}),
}));

vi.mock("$app/stores", () => ({
    page: {
        subscribe: (fn: (value: unknown) => void) => {
            fn({ params: { project: "test" } });
            return () => {};
        },
    },
}));

describe("Graph View Page", () => {
    it("should render the project name and graph view title in English", () => {
        const data = { project: "Test Project" };
        render(Page, { props: { data } });

        expect(screen.getByText("← Return to Test Project")).toBeInTheDocument();
        expect(screen.getByText((content, element) => {
            return element?.tagName.toLowerCase() === "h1" && content.includes("Graph View");
        })).toBeInTheDocument();
    });
});
