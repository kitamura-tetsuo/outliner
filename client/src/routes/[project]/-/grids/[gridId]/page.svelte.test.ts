import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

vi.mock("$app/state", () => import("../../../../../tests/mocks/appState.svelte"));
// Route admission fixture: public demo cases remain anonymous; the browser
// access regression exercises the real authentication and ACL consumers.
vi.mock("../../../../../auth/UserManager", () => ({
    userManager: { getCurrentUser: () => null, addEventListener: () => () => {} },
}));
let projectDoc = new Y.Doc();
vi.mock("../../../../../lib/routeProject", async () => {
    const { store } = await import("../../../../../stores/store.svelte");
    return {
        openRouteProject: vi.fn(async () => {
            await Promise.resolve();
            store.project = { ydoc: projectDoc, schedules: projectDoc.getMap("schedules") } as unknown as NonNullable<
                typeof store.project
            >;
            return { projectId: projectDoc.guid, release: vi.fn() };
        }),
    };
});
// Only Monaco is substituted in jsdom. SELECT, metadata and the Grid renderer
// stay real, including when the route observes a registry-entry replacement.
vi.mock("../../../../../lib/monaco/monacoLoader", () => ({
    loadMonaco: () => import("../../../../../tests/mocks/fakeMonaco").then(module => module.fakeMonaco),
}));
import { createGrid, getGridRegistry, removeGrid } from "../../../../../services/yjstable/gridDocs";
import { resetPgliteForTests } from "../../../../../services/yjstable/pgliteService";
import { resetTableEngineForTests } from "../../../../../services/yjstable/tableEngine";
import { setPage } from "../../../../../tests/mocks/appState.svelte";
import GridStandalonePage from "./+page.svelte";

beforeEach(() => {
    setPage({ params: { project: "demo", gridId: "grid-a" } });
    projectDoc = new Y.Doc();
});
afterEach(async () => {
    cleanup();
    projectDoc.destroy();
    await resetTableEngineForTests();
});
afterAll(resetPgliteForTests);
const cell = () => screen.getByTestId("yjs-table-view").querySelector('td[data-col="value"] button');
const seed = (id = "grid-a", name = "Independent", value = 42) =>
    createGrid(projectDoc, { gridId: id, name, query: `SELECT ${value} AS value` });

describe("current-format standalone Grid route", { timeout: 60000 }, () => {
    it("renders its own SELECT and identity without any Table", async () => {
        seed();
        render(GridStandalonePage);
        await waitFor(() => expect(cell()?.textContent).toBe("42"), { timeout: 30000 });
        expect(screen.getByRole("heading", { level: 1 }).textContent?.trim()).toBe("Independent");
        expect(screen.getByTestId("yjs-table-view")).toHaveAttribute("data-grid-id", "grid-a");
        expect(projectDoc.getMap("yjsTables").size).toBe(0);
        expect(getGridRegistry(projectDoc).get("grid-a")?.has("sourceTableId")).toBe(false);
    });

    it("keeps two independent Grids on their requested standalone routes", async () => {
        seed();
        seed("grid-b", "Second", 7);
        const first = render(GridStandalonePage);
        await waitFor(() => expect(cell()?.textContent).toBe("42"), { timeout: 30000 });
        first.unmount();
        setPage({ params: { project: "demo", gridId: "grid-b" } });
        render(GridStandalonePage);
        await waitFor(() => expect(cell()?.textContent).toBe("7"), { timeout: 30000 });
        expect(screen.getByRole("heading", { level: 1 }).textContent?.trim()).toBe("Second");
    });

    it("observes names, removal and a replacement entry under the same Grid ID", async () => {
        seed();
        const oldEntry = getGridRegistry(projectDoc).get("grid-a")!;
        render(GridStandalonePage);
        await waitFor(() => expect(cell()?.textContent).toBe("42"), { timeout: 30000 });
        oldEntry.set("name", "Renamed");
        await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent?.trim()).toBe("Renamed"));
        removeGrid(projectDoc, "grid-a");
        await waitFor(() => expect(screen.getByText("Grid not found")).toBeTruthy());
        expect(screen.queryByTestId("yjs-table-view")).toBeNull();
        seed("grid-a", "Replacement", 7);
        await waitFor(() => expect(cell()?.textContent).toBe("7"), { timeout: 30000 });
        expect(getGridRegistry(projectDoc).get("grid-a")).not.toBe(oldEntry);
        expect(screen.getByRole("heading", { level: 1 }).textContent?.trim()).toBe("Replacement");
    });

    it("keeps a broken SELECT editable without a fallback Table", async () => {
        createGrid(projectDoc, { gridId: "grid-a", query: "SELECT * FROM missing_relation" });
        render(GridStandalonePage);
        await waitFor(
            () => expect(screen.getByTestId("yjs-table-query-error").textContent).toContain("missing_relation"),
            { timeout: 30000 },
        );
        await fireEvent.click(screen.getByTestId("yjs-table-toggle-ui"));
        expect(screen.getByTestId("yjs-table-query-input")).toBeTruthy();
        expect(projectDoc.getMap("yjsTables").size).toBe(0);
    });

    it("reports a missing Grid without creating one", async () => {
        render(GridStandalonePage);
        await waitFor(() => expect(screen.getByText("Grid not found")).toBeTruthy());
        expect(getGridRegistry(projectDoc).size).toBe(0);
    });

    it("gates private cached definitions before rendering query rows", async () => {
        seed();
        setPage({ params: { project: "private-project", gridId: "grid-a" } });
        render(GridStandalonePage);
        await waitFor(() => expect(screen.getByText("Login required")).toBeTruthy());
        expect(screen.queryByTestId("yjs-table-view")).toBeNull();
    });
});
