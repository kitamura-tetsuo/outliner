import { cleanup, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

// Mocked Svelte store for `$app/stores`; the route reads `$page.params`.
const mockPageStore = { params: { project: "demo", tableId: "demo-table-sales" } };
vi.mock("$app/stores", () => ({
    page: {
        subscribe: (run: (value: typeof mockPageStore) => void) => {
            run(mockPageStore);
            return () => {};
        },
    },
}));

// The real UserManager talks to Firebase; the anonymous visitor case is one of
// the things under test, so it always reports "no user".
vi.mock("../../../../auth/UserManager", () => ({
    userManager: {
        // Matches UserManager's `IUser | null` contract for a signed-out visitor.
        getCurrentUser: () => null,
        addEventListener: () => () => {},
    },
}));

const salesDoc = new Y.Doc();
let projectDoc = new Y.Doc();

// Stands in for the shared project opener: publishing on `store.project` is
// what the route consumes, and the demo-seeding path it wraps needs a server.
vi.mock("../../../../lib/routeProject", async () => {
    const { store } = await import("../../../../stores/store.svelte");
    return {
        openRouteProject: vi.fn(async () => {
            // Must not publish synchronously: the real opener always awaits a
            // connection first, and a synchronous store write lands inside the
            // caller's tracked effect scope and re-triggers it forever.
            await Promise.resolve();
            store.project = {
                ydoc: projectDoc,
                schedules: projectDoc.getMap("schedules"),
            } as unknown as NonNullable<typeof store.project>;
            return { release: vi.fn() };
        }),
    };
});

vi.mock("../../../../lib/demoInit", () => ({
    DemoInitAborted: class DemoInitAborted extends Error {},
}));

vi.mock("../../../../services/yjstable/tableDocs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../../services/yjstable/tableDocs")>();
    return {
        ...actual,
        listTables: () => [{ tableId: "demo-table-sales", name: "Sales", sqlName: "sales" }],
        getTableHandles: () => ({ doc: salesDoc, tableId: "demo-table-sales" }),
        destroyTableUndoManager: vi.fn(),
    };
});

// TableEntityView mounts the PGlite engine; the page's own composition — never
// resolving a Grid, and listing references instead — is what is under test.
vi.mock("../../../../components/yjstable/TableEntityView.svelte", async () => {
    const Stub = (await import("./__fixtures__/TableViewStub.svelte")).default;
    return { default: Stub };
});

import { createScheduleRule } from "../../../../services/schedule/scheduleRuleService";
import { createGrid, GRID_REGISTRY_KEY, listGrids } from "../../../../services/yjstable/gridDocs";
import { store } from "../../../../stores/store.svelte";
import TableStandalonePage from "./+page.svelte";

/** The project the mocked opener publishes, as the page sees it. */
function currentProject(): NonNullable<typeof store.project> {
    return store.project as NonNullable<typeof store.project>;
}

describe("standalone table route", () => {
    beforeEach(() => {
        mockPageStore.params = { project: "demo", tableId: "demo-table-sales" };
        // A fresh doc per test: the Grid registry assertions below are about
        // what this page did, so leftovers from a sibling test would lie.
        projectDoc = new Y.Doc();
    });

    afterEach(() => {
        cleanup();
    });

    describe("access gate", () => {
        it("renders the demo table for an anonymous visitor instead of a login wall", async () => {
            render(TableStandalonePage);

            await waitFor(() => {
                expect(screen.getByTestId("table-view-stub")).toBeTruthy();
            });
            expect(screen.queryByText("Login required")).toBeNull();
            expect(screen.queryByText("Please log in to view this table.")).toBeNull();
        });

        it("shows the guest banner rather than the sign-in form on the demo project", async () => {
            render(TableStandalonePage);

            await waitFor(() => {
                expect(screen.getByText("Public demo / Guest access")).toBeTruthy();
            });
            // The sign-in form is what produced the reported wall; it must be absent.
            expect(screen.queryByText("Login with Google")).toBeNull();
        });

        it("still gates a non-public project behind sign-in", async () => {
            mockPageStore.params = { project: "private-project", tableId: "demo-table-sales" };

            render(TableStandalonePage);

            await waitFor(() => {
                expect(screen.getByText("Login required")).toBeTruthy();
            });
            expect(screen.queryByTestId("table-view-stub")).toBeNull();
        });
    });

    // Issue #5012: the URL subject and the page subject must match. A Table URL
    // is about the Table, so opening it may not reach into the Grid registry.
    describe("never resolves a Grid", () => {
        it("creates no Grid when the table has none", async () => {
            render(TableStandalonePage);

            await waitFor(() => {
                expect(screen.getByTestId("table-view-stub")).toBeTruthy();
            });
            expect(listGrids(projectDoc)).toHaveLength(0);
            expect(projectDoc.getMap(GRID_REGISTRY_KEY).size).toBe(0);
        });

        it("leaves an existing Grid registry untouched", async () => {
            createGrid(projectDoc, "demo-table-sales", { gridId: "grid-a", name: "Open sales" });
            const before = Y.encodeStateAsUpdate(projectDoc);

            render(TableStandalonePage);

            await waitFor(() => {
                expect(screen.getByTestId("table-grid-references")).toBeTruthy();
            });
            expect(listGrids(projectDoc).map(g => g.gridId)).toEqual(["grid-a"]);
            expect(Y.encodeStateAsUpdate(projectDoc)).toEqual(before);
        });

        it("renders the table even with zero Grids in the project", async () => {
            render(TableStandalonePage);

            await waitFor(() => {
                expect(screen.getByTestId("table-view-stub")).toBeTruthy();
            });
            expect(screen.getByTestId("table-grid-references-empty")).toBeTruthy();
        });
    });

    describe("grid reference list", () => {
        it("lists every Grid whose sourceTableId is this table, linking to its own page", async () => {
            createGrid(projectDoc, "demo-table-sales", {
                gridId: "grid-a",
                name: "Open sales",
                query: "SELECT * FROM sales WHERE revenue > 100",
            });
            createGrid(projectDoc, "demo-table-sales", { gridId: "grid-b", name: "Sales by month" });
            createGrid(projectDoc, "other-table", { gridId: "grid-other", name: "Unrelated" });

            render(TableStandalonePage);

            await waitFor(() => {
                expect(screen.getByText("Open sales")).toBeTruthy();
            });
            expect(screen.getByText("Open sales").getAttribute("href")).toBe("/grids/demo/grid-a");
            expect(screen.getByText("Sales by month").getAttribute("href")).toBe("/grids/demo/grid-b");
            expect(screen.queryByText("Unrelated")).toBeNull();
        });

        it("does not mount any Grid result: the page is an inspector, not a dashboard", async () => {
            createGrid(projectDoc, "demo-table-sales", { gridId: "grid-a", name: "Open sales" });
            createGrid(projectDoc, "demo-table-sales", { gridId: "grid-b", name: "Sales by month" });

            render(TableStandalonePage);

            await waitFor(() => {
                expect(screen.getByText("Open sales")).toBeTruthy();
            });
            // One Table view (the stub), no Grid views.
            expect(screen.getAllByTestId("table-view-stub")).toHaveLength(1);
            expect(screen.queryAllByTestId("yjs-table-view")).toHaveLength(0);
        });
    });

    describe("schedule reference list", () => {
        it("reports schedules that reference the table without implying ownership", async () => {
            render(TableStandalonePage);
            await waitFor(() => {
                expect(screen.getByTestId("table-schedule-references")).toBeTruthy();
            });

            createScheduleRule(currentProject(), {
                name: "Nightly refresh",
                targetTableId: "demo-table-sales",
                sql: "INSERT INTO sales (id) VALUES (gen_random_uuid())",
                rrule: "FREQ=DAILY",
            });

            await waitFor(() => {
                expect(screen.getByText("Nightly refresh")).toBeTruthy();
            });
            expect(screen.getByText("Nightly refresh").getAttribute("href"))
                .toBe("/schedules/demo/" + screen.getByText("Nightly refresh").getAttribute("data-schedule-id"));
            expect(screen.getByText("writes to this table")).toBeTruthy();
        });

        it("shows an empty state when nothing schedules against the table", async () => {
            render(TableStandalonePage);

            await waitFor(() => {
                expect(screen.getByTestId("table-schedule-references-empty")).toBeTruthy();
            });
        });
    });
});
