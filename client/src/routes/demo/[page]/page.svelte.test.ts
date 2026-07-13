import { cleanup, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { store } from "../../../stores/store.svelte";
import { yjsStore } from "../../../stores/yjsStore.svelte";
import DemoPageView from "./+page.svelte";
import { writable } from "svelte/store";

// Mock dependencies
vi.mock("../../../lib/demoSeed", () => ({
    seedDemo: vi.fn().mockResolvedValue(undefined),
    DEMO_PROJECT_NAME: "demo",
}));

vi.mock("../../../services", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../services")>();
    const Y = await import("yjs");
    return {
        ...actual,
        getYjsClientByProjectTitle: vi.fn().mockResolvedValue({
            getProject: () => {
                const doc = new Y.Doc();
                doc.getMap("metadata").set("title", "demo");
                doc.getMap("metadata").set("lastReset", 0);
                return {
                    ydoc: doc,
                };
            },
            dispose: vi.fn(),
        }),
    };
});

vi.mock("../../../schema/app-schema", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../schema/app-schema")>();
    return {
        ...actual,
        Project: {
            fromDoc: vi.fn().mockImplementation((ydoc) => {
                return {
                    ydoc,
                    addPage: vi.fn(),
                    items: {
                        find: vi.fn(),
                        root: { items: { toArray: () => [] } }
                    },
                };
            }),
            createInstance: actual.Project.createInstance,
        },
    };
});

vi.mock("../../../utils/pageUtils", () => ({
    findPageByName: vi.fn(),
}));

// Mock $app/stores by hoisting
const mockPageStore = { params: { page: "TestPage" }, url: new URL("http://localhost/demo/TestPage") };
vi.mock("$app/stores", () => {
    return {
        page: {
            subscribe: (fn: any) => {
                fn(mockPageStore);
                return () => {};
            }
        }
    };
});

describe("Demo Page View", () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();

        store.project = undefined;
        store.currentPage = undefined;
        yjsStore.yjsClient = undefined;

        // Ensure notYetSynced is false initially so we don't wait forever
        yjsStore.notYetSynced = false;
    });

    it("should show loading state initially", async () => {
        // We delay the getYjsClient mock to force the loading state to stay active
        const { getYjsClientByProjectTitle } = await import("../../../services");
        (getYjsClientByProjectTitle as any).mockImplementationOnce(() => new Promise(() => {}));

        render(DemoPageView);

        expect(screen.getByText("Loading Demo...")).toBeInTheDocument();
    });

    it("should render page not found state when page is missing", async () => {
        const { findPageByName } = await import("../../../utils/pageUtils");
        (findPageByName as any).mockReturnValue(undefined); // Simulate page missing

        render(DemoPageView);

        // Wait for async operations (loading client and finding page)
        await vi.waitFor(() => {
            expect(screen.getByText("Page not found")).toBeInTheDocument();
        }, { timeout: 2000, interval: 50 });

        expect(screen.getByText('The page "TestPage" does not exist in the demo project.')).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Create Page" })).toBeInTheDocument();
    });

    it("should render outliner when page is found", async () => {
        const mockPageItem = {
            id: "page-1",
            text: "TestPage",
            key: "page-1",
            created: 0,
            lastChanged: 0,
            yMap: { observe: vi.fn(), unobserve: vi.fn(), get: vi.fn() },
            isDeleted: false,
            items: { root: { items: { toArray: () => [] } } }
        };

        const { findPageByName } = await import("../../../utils/pageUtils");
        (findPageByName as any).mockReturnValue(mockPageItem);

        render(DemoPageView);

        await vi.waitFor(() => {
            expect(screen.queryByText("Loading Demo...")).not.toBeInTheDocument();
        }, { timeout: 2000, interval: 50 });

        expect(screen.queryByText("Page not found")).not.toBeInTheDocument();

        const elements = screen.getAllByText("TestPage");
        expect(elements.length).toBeGreaterThan(0);
    });
});
