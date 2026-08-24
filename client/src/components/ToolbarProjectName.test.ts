import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { Project } from "../schema/app-schema";
import { isProvisionalProject, store } from "../stores/store.svelte";
import Toolbar from "./Toolbar.svelte";

const mockPage = { params: { project: "" } };
vi.mock("$app/stores", () => ({
    page: {
        subscribe: (run: (value: typeof mockPage) => void) => {
            run(mockPage);
            return () => {};
        },
    },
}));

// Captured at import time, before any test clears the store: this is the
// placeholder `store.svelte.ts` seeds from the URL at startup.
const provisionalProject = store.project;

describe("Toolbar project name", () => {
    beforeAll(() => {
        // The toolbar publishes its height through a ResizeObserver, which jsdom
        // does not implement. Nothing under test depends on the measurement.
        if (!("ResizeObserver" in globalThis)) {
            globalThis.ResizeObserver = class {
                observe() {}
                unobserve() {}
                disconnect() {}
            } as unknown as typeof ResizeObserver;
        }
    });

    afterEach(() => {
        cleanup();
        // `store` is a module-scoped singleton: a leftover project would leak
        // into the next test's "not loaded yet" assertion.
        store.project = undefined;
        mockPage.params.project = "";
    });

    test("renders no label while no project is loaded", () => {
        store.project = undefined;
        const { queryByTestId } = render(Toolbar, { props: {} });
        expect(queryByTestId("toolbar-project-name")).toBeNull();
    });

    test("stays silent for the provisional project the store seeds from the URL", () => {
        // The startup placeholder is titled from the path, so showing it would
        // put a route segment — "Untitled Project" at the root — in the header.
        store.project = provisionalProject;
        expect(isProvisionalProject(store.project)).toBe(true);

        const { queryByTestId } = render(Toolbar, { props: {} });
        expect(queryByTestId("toolbar-project-name")).toBeNull();
    });

    test("names the loaded project and links to its page list", async () => {
        mockPage.params.project = "Alpha";
        const project = Project.createInstance("stale Yjs title");
        const { findByTestId } = render(Toolbar, { props: { project } });

        const label = await findByTestId("toolbar-project-name");
        expect(label.textContent?.trim()).toBe("Alpha");
        expect(label.getAttribute("href")).toBe("/Alpha");
        expect(label.getAttribute("aria-label")).toBe("Project: Alpha");
    });

    test("falls back to the global store when no project prop is given", async () => {
        mockPage.params.project = "From Directory";
        store.project = Project.createInstance("stale Yjs title");

        const { findByTestId } = render(Toolbar, { props: {} });

        const label = await findByTestId("toolbar-project-name");
        expect(label.textContent?.trim()).toBe("From Directory");
    });

    test("percent-encodes a title that is not URL-safe", async () => {
        mockPage.params.project = "My Project/2";
        const project = Project.createInstance("stale Yjs title");
        const { findByTestId } = render(Toolbar, { props: { project } });

        const label = await findByTestId("toolbar-project-name");
        expect(label.getAttribute("href")).toBe("/My%20Project%2F2");
    });

    test("does not expose a stale Yjs title when the route has no canonical title", () => {
        const project = Project.createInstance("stale Yjs title");
        const { queryByTestId } = render(Toolbar, { props: { project } });

        expect(queryByTestId("toolbar-project-name")).toBeNull();
    });
});
