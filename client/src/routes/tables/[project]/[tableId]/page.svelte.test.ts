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

// The real UserManager talks to Firebase; the anonymous visitor case is the
// whole point of these tests, so it always reports "no user".
vi.mock("../../../../auth/UserManager", () => ({
    userManager: {
        // Matches UserManager's `IUser | null` contract for a signed-out visitor.
        getCurrentUser: () => null,
        addEventListener: () => () => {},
    },
}));

const salesDoc = new Y.Doc();
const projectDoc = new Y.Doc();

vi.mock("../../../../services", () => ({
    getYjsClientByProjectTitle: vi.fn(async () => ({
        getProject: () => ({ ydoc: projectDoc }),
    })),
}));

vi.mock("../../../../services/yjstable/tableDocs", () => ({
    listTables: () => [{ tableId: "demo-table-sales", name: "Sales", sqlName: "sales" }],
    getTableHandles: () => ({ doc: salesDoc }),
    destroyTableUndoManager: vi.fn(),
}));

// YjsTableView renders a full grid engine; the gate, not the grid, is under test.
vi.mock("../../../../components/yjstable/YjsTableView.svelte", async () => {
    const Stub = (await import("./__fixtures__/TableViewStub.svelte")).default;
    return { default: Stub };
});

import TableStandalonePage from "./+page.svelte";

describe("standalone table route access gate", () => {
    beforeEach(() => {
        mockPageStore.params = { project: "demo", tableId: "demo-table-sales" };
    });

    afterEach(() => {
        cleanup();
    });

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
