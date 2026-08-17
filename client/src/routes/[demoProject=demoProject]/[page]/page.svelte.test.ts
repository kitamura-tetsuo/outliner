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

// The demo project's page list. An array so the real page-list helpers
// (findPageByKey, iterateItems) walk it exactly as they do in the app.
const mockProjectItems: Record<string, unknown>[] = [];

vi.mock("../../../schema/app-schema", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../schema/app-schema")>();
    return {
        ...actual,
        Project: {
            fromDoc: vi.fn().mockImplementation((ydoc: import("yjs").Doc) => {
                return {
                    ydoc,
                    addPage: vi.fn(),
                    // The array's own `find` is left alone: the page list is
                    // walked with it, here and by the real page-list helpers.
                    items: Object.assign(mockProjectItems, {
                        root: { items: { toArray: () => [] } },
                    }),
                };
            }),
            createInstance: actual.Project.createInstance,
        },
    };
});

// Only the name lookup is mocked; the rename-detection helpers stay real so
// their behavior is under test rather than stubbed out.
vi.mock("../../../utils/pageUtils", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../utils/pageUtils")>();
    return {
        ...actual,
        findPageByName: vi.fn(),
    };
});

// Mock $app/stores by hoisting. The subscribers are kept so a navigation can
// push new route params, the way SvelteKit's router does.
const pageSubscribers = new Set<(value: { params: Record<string, string>; url: URL; }) => void>();
let mockPageStore = {
    params: { demoProject: "demo", page: "TestPage" },
    url: new URL("http://localhost/demo/TestPage"),
};

function setRoutePage(pageName: string) {
    mockPageStore = {
        params: { ...mockPageStore.params, page: pageName },
        url: new URL(`http://localhost/demo/${encodeURIComponent(pageName)}`),
    };
    pageSubscribers.forEach(fn => fn(mockPageStore));
}

vi.mock("$app/stores", () => {
    return {
        page: {
            subscribe: (fn: (value: { params: Record<string, string>; url: URL; }) => void) => {
                pageSubscribers.add(fn);
                fn(mockPageStore);
                return () => pageSubscribers.delete(fn);
            },
        },
    };
});

// `goto` stands in for the router: it applies the new page segment to the
// mocked page store, so a title-driven route update reaches the component the
// same way a real replaceState navigation would.
vi.mock("$app/navigation", () => ({
    goto: vi.fn((url: string) => {
        const segments = new URL(url, "http://localhost").pathname.split("/");
        setRoutePage(decodeURIComponent(segments[segments.length - 1] ?? ""));
        return Promise.resolve();
    }),
}));

describe("Demo Page View", () => {
    beforeEach(() => {
        cleanup();
        vi.clearAllMocks();

        mockProjectItems.length = 0;
        pageSubscribers.clear();
        setRoutePage("TestPage");

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

    describe("renaming the open page", () => {
        function makePageItem(text: string): Record<string, unknown> {
            return {
                id: "page-1",
                key: "page-1",
                text,
                created: 0,
                lastChanged: 0,
                yMap: { observe: vi.fn(), unobserve: vi.fn(), get: vi.fn() },
                isDeleted: false,
                items: { root: { items: { toArray: () => [] } } },
            };
        }

        /** Resolves a route segment against the page list, as the real lookup does. */
        function lookupByName(_items: unknown, name: string) {
            const target = decodeURIComponent(String(name)).trim().toLowerCase();
            return mockProjectItems.find(p => String(p.text).trim().toLowerCase() === target);
        }

        async function renderWithOpenPage(title: string) {
            const pageItem = makePageItem(title);
            mockProjectItems.push(pageItem);

            const { findPageByName } = await import("../../../utils/pageUtils");
            (findPageByName as Mock).mockImplementation(lookupByName);

            render(DemoPageView);

            await vi.waitFor(() => {
                expect(screen.queryByText("Loading Demo...")).not.toBeInTheDocument();
            }, { timeout: 2000, interval: 50 });
            await vi.waitFor(() => {
                expect(store.currentPage).toBe(pageItem);
            }, { timeout: 2000, interval: 50 });

            return pageItem;
        }

        /** Rename the page and raise the document-change signal its Yjs observer would. */
        function rename(pageItem: Record<string, unknown>, title: string) {
            pageItem.text = title;
            store.pagesVersion++;
        }

        it("keeps the page open and moves the route to the new title", async () => {
            const pageItem = await renderWithOpenPage("TestPage");
            const { goto } = await import("$app/navigation");
            const { acquireDemoClient } = await import("../../../services");
            const acquireCallsBeforeRename = (acquireDemoClient as Mock).mock.calls.length;

            rename(pageItem, "Renamed Page");

            await vi.waitFor(() => {
                expect(goto).toHaveBeenCalledWith(
                    expect.stringContaining("Renamed%20Page"),
                    { replaceState: true, keepFocus: true, noScroll: true },
                );
            }, { timeout: 2000, interval: 50 });

            // The rename must never fall through to the missing-page path, and
            // the same page instance stays mounted throughout.
            expect(screen.queryByText("Page not found")).not.toBeInTheDocument();
            expect(store.currentPage).toBe(pageItem);
            await vi.waitFor(() => {
                expect(screen.getAllByText("Renamed Page").length).toBeGreaterThan(0);
            }, { timeout: 2000, interval: 50 });
            expect(screen.queryByText("Page not found")).not.toBeInTheDocument();

            // A title-only route change reuses the demo client it already has.
            expect((acquireDemoClient as Mock).mock.calls.length).toBe(acquireCallsBeforeRename);
        });

        it("encodes a renamed Japanese title in the route", async () => {
            const pageItem = await renderWithOpenPage("TestPage");
            const { goto } = await import("$app/navigation");

            rename(pageItem, "書式ノート");

            await vi.waitFor(() => {
                expect(goto).toHaveBeenCalledWith(
                    expect.stringContaining(encodeURIComponent("書式ノート")),
                    { replaceState: true, keepFocus: true, noScroll: true },
                );
            }, { timeout: 2000, interval: 50 });

            expect(screen.queryByText("Page not found")).not.toBeInTheDocument();
            await vi.waitFor(() => {
                expect(screen.getAllByText("書式ノート").length).toBeGreaterThan(0);
            }, { timeout: 2000, interval: 50 });
        });

        it("opens another demo page on navigation instead of pulling the route back", async () => {
            await renderWithOpenPage("TestPage");
            const secondPage = { ...makePageItem("Second Page"), id: "page-2", key: "page-2" };
            mockProjectItems.push(secondPage);
            const { goto } = await import("$app/navigation");

            setRoutePage("Second Page");

            await vi.waitFor(() => {
                expect(store.currentPage).toBe(secondPage);
            }, { timeout: 2000, interval: 50 });
            // The route names the page the visitor asked for; nothing may rewrite it.
            expect(goto).not.toHaveBeenCalled();
            expect(screen.queryByText("Page not found")).not.toBeInTheDocument();
        });

        it("still shows the missing-page state when navigating to a page that does not exist", async () => {
            await renderWithOpenPage("TestPage");

            setRoutePage("No Such Page");

            await vi.waitFor(() => {
                expect(screen.getByText("Page not found")).toBeInTheDocument();
            }, { timeout: 2000, interval: 50 });
            expect(screen.getByRole("button", { name: "Create Page" })).toBeInTheDocument();
        });
    });
});
