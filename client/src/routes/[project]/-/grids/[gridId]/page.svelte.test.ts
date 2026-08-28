// The standalone Grid route (issue #5012): /grids/<project>/<gridId> is a page
// about one Grid — its own SELECT and presentation over a source Table it
// references but does not own.

import { cleanup, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

const mockPageStore = { params: { project: "demo", gridId: "grid-a" } };
vi.mock("$app/stores", () => ({
    page: {
        subscribe: (run: (value: typeof mockPageStore) => void) => {
            run(mockPageStore);
            return () => {};
        },
    },
}));

vi.mock("../../../../../auth/UserManager", () => ({
    userManager: {
        getCurrentUser: () => null,
        addEventListener: () => () => {},
    },
}));

const salesDoc = new Y.Doc();
let projectDoc = new Y.Doc();
let registeredTables: { tableId: string; name: string; sqlName: string; }[] = [];

vi.mock("../../../../../lib/routeProject", async () => {
    const { store } = await import("../../../../../stores/store.svelte");
    return {
        openRouteProject: vi.fn(async () => {
            // Asynchronous on purpose: a synchronous store write would land
            // inside the caller's tracked effect and re-trigger it forever.
            await Promise.resolve();
            store.project = {
                ydoc: projectDoc,
                schedules: projectDoc.getMap("schedules"),
            } as unknown as NonNullable<typeof store.project>;
            return { release: vi.fn() };
        }),
    };
});

vi.mock("../../../../../lib/demoInit", () => ({
    DemoInitAborted: class DemoInitAborted extends Error {},
}));

vi.mock("../../../../../services/yjstable/tableDocs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../../services/yjstable/tableDocs")>();
    return {
        ...actual,
        listTables: () => registeredTables,
        getTableHandles: (_doc: Y.Doc, tableId: string) =>
            registeredTables.some(t => t.tableId === tableId)
                ? { doc: salesDoc, tableId }
                : undefined,
        destroyTableUndoManager: vi.fn(),
    };
});

// YjsTableView drives the PGlite engine; the route's own resolution is what is
// under test here.
vi.mock("../../../../../components/yjstable/YjsTableView.svelte", async () => {
    const Stub = (await import("./__fixtures__/GridViewStub.svelte")).default;
    return { default: Stub };
});

import { createGrid } from "../../../../../services/yjstable/gridDocs";
import GridStandalonePage from "./+page.svelte";

describe("standalone grid route", () => {
    beforeEach(() => {
        mockPageStore.params = { project: "demo", gridId: "grid-a" };
        projectDoc = new Y.Doc();
        registeredTables = [{ tableId: "demo-table-sales", name: "Sales", sqlName: "sales" }];
    });

    afterEach(() => {
        cleanup();
    });

    it("renders the requested Grid over its own source Table", async () => {
        createGrid(projectDoc, "demo-table-sales", {
            gridId: "grid-a",
            name: "Open sales",
            query: "SELECT * FROM sales WHERE revenue > 100",
        });

        render(GridStandalonePage);

        await waitFor(() => {
            expect(screen.getByTestId("grid-view-stub")).toBeTruthy();
        });
        expect(screen.getByTestId("grid-view-stub").getAttribute("data-grid-id")).toBe("grid-a");
        expect(screen.getByTestId("grid-view-stub").getAttribute("data-source-table-id"))
            .toBe("demo-table-sales");
    });

    it("links back to the source Table rather than owning its schema", async () => {
        createGrid(projectDoc, "demo-table-sales", { gridId: "grid-a", name: "Open sales" });

        render(GridStandalonePage);

        await waitFor(() => {
            expect(screen.getByTestId("grid-source-table-link")).toBeTruthy();
        });
        expect(screen.getByTestId("grid-source-table-link").getAttribute("href"))
            .toBe("/demo/-/tables/demo-table-sales");
    });

    it("keeps two Grids over one Table independent", async () => {
        createGrid(projectDoc, "demo-table-sales", {
            gridId: "grid-a",
            name: "Open sales",
            query: "SELECT * FROM sales WHERE revenue > 100",
        });
        createGrid(projectDoc, "demo-table-sales", {
            gridId: "grid-b",
            name: "Sales by month",
            query: "SELECT month FROM sales",
        });

        const first = render(GridStandalonePage);
        await waitFor(() => {
            expect(screen.getByTestId("grid-view-stub").getAttribute("data-grid-id")).toBe("grid-a");
        });
        expect(screen.getByRole("heading", { level: 1 }).textContent?.trim()).toBe("Open sales");
        first.unmount();

        mockPageStore.params = { project: "demo", gridId: "grid-b" };
        render(GridStandalonePage);
        await waitFor(() => {
            expect(screen.getByTestId("grid-view-stub").getAttribute("data-grid-id")).toBe("grid-b");
        });
        expect(screen.getByRole("heading", { level: 1 }).textContent?.trim()).toBe("Sales by month");
    });

    it("shows an explicit missing-source state when the Table is gone", async () => {
        createGrid(projectDoc, "deleted-table", { gridId: "grid-a", name: "Orphan" });

        render(GridStandalonePage);

        await waitFor(() => {
            expect(screen.getByTestId("grid-missing-source")).toBeTruthy();
        });
        expect(screen.queryByTestId("grid-view-stub")).toBeNull();
    });

    it("reports a Grid id that is not in the registry as not found", async () => {
        render(GridStandalonePage);

        await waitFor(() => {
            expect(screen.getByText("Grid not found")).toBeTruthy();
        });
        expect(screen.queryByTestId("grid-view-stub")).toBeNull();
    });

    it("still gates a non-public project behind sign-in", async () => {
        createGrid(projectDoc, "demo-table-sales", { gridId: "grid-a", name: "Open sales" });
        mockPageStore.params = { project: "private-project", gridId: "grid-a" };

        render(GridStandalonePage);

        await waitFor(() => {
            expect(screen.getByText("Login required")).toBeTruthy();
        });
        expect(screen.queryByTestId("grid-view-stub")).toBeNull();
    });
});
