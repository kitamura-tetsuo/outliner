import { cleanup, render, waitFor } from "@testing-library/svelte";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { Project } from "../schema/app-schema";
import { isProvisionalProject, store } from "../stores/store.svelte";
import Toolbar from "./Toolbar.svelte";

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
        const project = Project.createInstance("Alpha");
        const { findByTestId } = render(Toolbar, { props: { project } });

        const label = await findByTestId("toolbar-project-name");
        expect(label.textContent?.trim()).toBe("Alpha");
        expect(label.getAttribute("href")).toBe("/Alpha");
        expect(label.getAttribute("aria-label")).toBe("Project: Alpha");
    });

    test("falls back to the global store when no project prop is given", async () => {
        store.project = Project.createInstance("From Store");

        const { findByTestId } = render(Toolbar, { props: {} });

        const label = await findByTestId("toolbar-project-name");
        expect(label.textContent?.trim()).toBe("From Store");
    });

    test("percent-encodes a title that is not URL-safe", async () => {
        const project = Project.createInstance("My Project/2");
        const { findByTestId } = render(Toolbar, { props: { project } });

        const label = await findByTestId("toolbar-project-name");
        expect(label.getAttribute("href")).toBe("/My%20Project%2F2");
    });

    test("picks the title up when it arrives with the document's first sync", async () => {
        // The server writes the title as part of seeding, so a document can be
        // open and still untitled for a moment. Falling back to the route's
        // project segment keeps the header addressed correctly meanwhile.
        const project = Project.createInstance("");
        const { findByTestId, queryByTestId } = render(Toolbar, { props: { project } });

        expect(queryByTestId("toolbar-project-name")).toBeNull();

        project.title = "Arrived Late";
        const label = await findByTestId("toolbar-project-name");
        expect(label.textContent?.trim()).toBe("Arrived Late");
    });

    test("follows a rename of the open project rather than going stale", async () => {
        const project = Project.createInstance("Before");
        const { findByTestId } = render(Toolbar, { props: { project } });

        const label = await findByTestId("toolbar-project-name");
        expect(label.textContent?.trim()).toBe("Before");

        project.title = "After";
        await waitFor(() => expect(label.textContent?.trim()).toBe("After"));
    });

    test("switching projects replaces the name instead of leaving a stale one", async () => {
        store.project = Project.createInstance("First");
        const { findByTestId } = render(Toolbar, { props: {} });
        expect((await findByTestId("toolbar-project-name")).textContent?.trim()).toBe("First");

        store.project = Project.createInstance("Second");

        await waitFor(async () => {
            expect((await findByTestId("toolbar-project-name")).textContent?.trim()).toBe("Second");
        });
    });
});
