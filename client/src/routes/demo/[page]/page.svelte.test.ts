import { cleanup, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { store } from "../../../stores/store.svelte";
import { yjsStore } from "../../../stores/yjsStore.svelte";
import DemoPageView from "./+page.svelte";

// Mock dependencies
vi.mock("../../../lib/demoSeed", () => ({
    seedDemo: vi.fn().mockResolvedValue({ ok: true, reset: false }),
    DEMO_PROJECT_NAME: "demo",
    SeedDemoError: class SeedDemoError extends Error {
        rateLimitMs?: number;
    },
}));

vi.mock("../../../services", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../services")>();
    const Y = await import("yjs");
    return {
        ...actual,
        acquireDemoClient: vi.fn().mockResolvedValue({
            getProject: () => {
                const doc = new Y.Doc();
                doc.getMap("metadata").set("title", "demo");
                doc.getMap("metadata").set("lastReset", 0);
                return {
                    ydoc: doc,
                };
            },
        }),
        releaseDemoClient: vi.fn().mockReturnValue(0),
    };
});

vi.mock("../../../schema/app-schema", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../schema/app-schema")>();
    return {
        ...actual,
        Project: {
            fromDoc: vi.fn().mockImplementation((ydoc: import("yjs").Doc) => {
                return {
                    ydoc,
                    addPage: vi.fn(),
                    items: {
                        find: vi.fn(),
                        root: { items: { toArray: () => [] } },
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
            subscribe: (fn: (value: { params: Record<string, string>; url: URL; }) => void) => {
                fn(mockPageStore);
                return () => {};
            },
        },
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
        yjsStore.syncError = null;
    });

    it("should show loading state initially", async () => {
        // We delay the acquireDemoClient mock to force the loading state to stay active
        const { acquireDemoClient } = await import("../../../services");
        (acquireDemoClient as Mock).mockImplementationOnce(() => new Promise(() => {}));

        render(DemoPageView);

        expect(screen.getByText("Loading Demo...")).toBeInTheDocument();
    });

    it("should render page not found state when page is missing", async () => {
        const { findPageByName } = await import("../../../utils/pageUtils");
        (findPageByName as Mock).mockReturnValue(undefined); // Simulate page missing

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
            items: { root: { items: { toArray: () => [] } } },
        };

        const { findPageByName } = await import("../../../utils/pageUtils");
        (findPageByName as Mock).mockReturnValue(mockPageItem);

        render(DemoPageView);

        await vi.waitFor(() => {
            expect(screen.queryByText("Loading Demo...")).not.toBeInTheDocument();
        }, { timeout: 2000, interval: 50 });

        expect(screen.queryByText("Page not found")).not.toBeInTheDocument();

        const elements = screen.getAllByText("TestPage");
        expect(elements.length).toBeGreaterThan(0);
    });

    it("should render reset state when isResetting is true", async () => {
        const Y_mod = await import("yjs");
        const { acquireDemoClient } = await import("../../../services");
        (acquireDemoClient as Mock).mockResolvedValueOnce({
            containerId: "mock-container",
            getProject: () => {
                const doc = new Y_mod.Doc();
                doc.getMap("metadata").set("title", "demo");
                doc.getMap("metadata").set("isResetting", true);
                doc.getMap("metadata").set("resetStartedAt", Date.now());
                return { ydoc: doc };
            },
        });

        const { findPageByName } = await import("../../../utils/pageUtils");
        (findPageByName as Mock).mockReturnValue(undefined); // Simulate page missing

        render(DemoPageView);

        await vi.waitFor(() => {
            expect(screen.queryByText("Loading Demo...")).not.toBeInTheDocument();
        }, { timeout: 2000, interval: 50 });

        await vi.waitFor(() => {
            expect(screen.getByText("Demo content is being reset")).toBeInTheDocument();
        }, { timeout: 2000, interval: 50 });

        expect(screen.queryByRole("button", { name: "Create Page" })).not.toBeInTheDocument();
    });

    it("should render error state when sync times out", async () => {
        const Y_mod = await import("yjs");
        const { acquireDemoClient } = await import("../../../services");
        (acquireDemoClient as Mock).mockResolvedValueOnce({
            containerId: "mock-container",
            getProject: () => {
                // Use the globally available Yjs instance or import it at test level
                const doc = new Y_mod.Doc();
                doc.getMap("metadata").set("title", "demo");
                doc.getMap("metadata").set("lastReset", 0);
                return { ydoc: doc };
            },
        });

        const { findPageByName } = await import("../../../utils/pageUtils");
        (findPageByName as Mock).mockReturnValue(undefined); // Simulate page missing

        // We can just set the property before rendering
        // But loadDemoPage will execute and overwrite it?
        // Let's use Object.defineProperty to make syncError read-only for this test.
        Object.defineProperty(yjsStore, "syncError", {
            get: () => "timed-out",
            set: () => {},
            configurable: true,
        });

        render(DemoPageView);

        await vi.waitFor(() => {
            expect(screen.getByText("An error occurred")).toBeInTheDocument();
        }, { timeout: 2000, interval: 50 });

        expect(screen.getByText("Connection to the real-time server failed or timed out.")).toBeInTheDocument();

        const retryButton = screen.getByRole("button", { name: "Retry" });
        expect(retryButton).toBeInTheDocument();

        // Restore
        Object.defineProperty(yjsStore, "syncError", { value: null, writable: true, configurable: true });
    });
});
