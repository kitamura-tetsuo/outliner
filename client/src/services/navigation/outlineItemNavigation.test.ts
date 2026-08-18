// The real `navigateToOutlineItem` — no stand-in for any of this repository's
// own code. Only SvelteKit's `$app/navigation` / `$app/stores` are replaced,
// the framework boundary every routing test here already replaces
// (BacklinkPanel.test.ts, SearchBox.test.ts, routes/[project]/graph/page.test.ts).
//
// The outline itself is a real `Project`, the collapse state a real
// `OutlinerViewModel` behind the same controller `OutlinerTree` registers, and
// the destination a real DOM built the way `OutlinerItem.svelte` builds it
// (`data-item-id`, and `.outliner.embedded` for the second tree an expanded
// alias mounts).

import { Project } from "$shared/app-schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const goto = vi.hoisted(() => vi.fn<(url: string, options?: unknown) => Promise<void>>(async () => {}));
const pathname = vi.hoisted(() => ({ current: "/Workspace/Tasks" }));

vi.mock("$app/navigation", () => ({ goto }));
vi.mock("$app/stores", () => ({
    page: { subscribe: (run: (value: unknown) => void) => (run({ url: { pathname: pathname.current } }), () => {}) },
}));
vi.mock("$app/paths", () => ({ resolve: (path: string) => path }));

const { navigateToOutlineItem } = await import("./outlineItemNavigation");
const { registerPageOutline } = await import("./outlinePageRegistry");
const { OutlinerViewModel } = await import("../../stores/OutlinerViewModel");
const { store: generalStore } = await import("../../stores/store.svelte");
const { editorOverlayStore } = await import("../../stores/EditorOverlayStore.svelte");

/** One `.outliner` root holding a row per id, mimicking a rendered page. */
function renderOutline(itemIds: string[], options: { embedded?: boolean; } = {}): HTMLElement {
    const root = document.createElement("div");
    root.className = options.embedded ? "outliner embedded" : "outliner";
    for (const id of itemIds) {
        const row = document.createElement("div");
        row.className = "outliner-item";
        row.setAttribute("data-item-id", id);
        root.appendChild(row);
    }
    document.body.appendChild(root);
    return root;
}

function seedProject() {
    const project = Project.createInstance("Workspace");
    const page = project.addPage("Tasks", "tester");
    const section = page.items.addNode("tester");
    section.updateText("Q3");
    const task = section.items.addNode("tester");
    task.updateText("Ship it");
    return { project, page, section, task };
}

/** A view model that has actually walked `page`, so collapse state is meaningful. */
function viewModelFor(page: ReturnType<typeof seedProject>["page"]) {
    const viewModel = new OutlinerViewModel();
    viewModel.updateFromModel(page);
    return viewModel;
}

/** The controller shape `OutlinerTree` registers, over a real view model. */
function controllerFor(viewModel: InstanceType<typeof OutlinerViewModel>) {
    return {
        expandItems: (itemIds: string[]) => {
            let expanded = false;
            for (const itemId of itemIds) {
                if (!viewModel.isCollapsed(itemId)) continue;
                viewModel.toggleCollapsed(itemId);
                expanded = true;
            }
            return expanded;
        },
    };
}

/**
 * Open `page` the way the app does. The project has to be set first: the
 * `currentPage` setter re-resolves a page that belongs to a different Y.Doc
 * than the current project, and would otherwise discard it.
 */
function openPage(project: Project, page: ReturnType<typeof seedProject>["page"]) {
    generalStore.project = project;
    generalStore.currentPage = page;
}

let unregister: (() => void) | undefined;

beforeEach(() => {
    goto.mockClear();
    pathname.current = "/Workspace/Tasks";
    document.body.innerHTML = "";
    generalStore.currentPage = undefined;
    generalStore.project = undefined;
    editorOverlayStore.setActiveItem(null);
});

afterEach(() => {
    unregister?.();
    unregister = undefined;
    generalStore.project = undefined;
    document.body.innerHTML = "";
});

describe("navigateToOutlineItem", () => {
    it("reveals and focuses an item on the open page without routing", async () => {
        const { project, page, task } = seedProject();
        openPage(project, page);
        unregister = registerPageOutline(page.key, controllerFor(viewModelFor(page)));
        renderOutline([page.id, task.id]);

        const revealed = await navigateToOutlineItem(project, task.key, { timeoutMs: 2000 });

        expect(revealed).toBe(true);
        expect(goto).not.toHaveBeenCalled();
        expect(editorOverlayStore.getActiveItem()).toBe(task.id);
    });

    it("routes to the owning page when a different page is open, encoding its title", async () => {
        const { project, page, task } = seedProject();
        page.updateText("設計メモ & plans");
        // A different page is open, so the owning page has to be routed to.
        const otherPage = project.addPage("Elsewhere", "tester");
        openPage(project, otherPage);
        unregister = registerPageOutline(page.key, controllerFor(viewModelFor(page)));
        renderOutline([page.id, task.id]);

        const revealed = await navigateToOutlineItem(project, task.key, { timeoutMs: 2000 });

        expect(revealed).toBe(true);
        expect(goto).toHaveBeenCalledTimes(1);
        expect(goto.mock.calls[0][0]).toBe("/Workspace/%E8%A8%AD%E8%A8%88%E3%83%A1%E3%83%A2%20%26%20plans");
        expect(editorOverlayStore.getActiveItem()).toBe(task.id);
    });

    it("expands the collapsed ancestors hiding the target, in the owning page's own view model", async () => {
        const { project, page, section, task } = seedProject();
        const viewModel = viewModelFor(page);
        viewModel.toggleCollapsed(section.id);
        expect(viewModel.isCollapsed(section.id)).toBe(true);

        openPage(project, page);
        unregister = registerPageOutline(page.key, controllerFor(viewModel));
        renderOutline([page.id, section.id, task.id]);

        const revealed = await navigateToOutlineItem(project, task.key, { timeoutMs: 2000 });

        expect(revealed).toBe(true);
        expect(viewModel.isCollapsed(section.id)).toBe(false);
    });

    it("scrolls to the item's own row, not to the copy an expanded alias renders", async () => {
        const { project, page, task } = seedProject();
        openPage(project, page);
        unregister = registerPageOutline(page.key, controllerFor(viewModelFor(page)));

        // The alias's embedded tree comes first in document order, so a
        // document-wide lookup would land on it.
        renderOutline([task.id], { embedded: true });
        const ownPage = renderOutline([page.id, task.id]);
        const ownRow = ownPage.querySelector(`[data-item-id="${task.id}"]`) as HTMLElement;
        const scrolled: HTMLElement[] = [];
        for (const row of document.querySelectorAll<HTMLElement>(`[data-item-id="${task.id}"]`)) {
            row.scrollIntoView = () => scrolled.push(row);
        }

        const revealed = await navigateToOutlineItem(project, task.key, { timeoutMs: 2000 });

        expect(revealed).toBe(true);
        expect(scrolled).toEqual([ownRow]);
    });

    it("fails safely for an identity that is not an outline item, without routing", async () => {
        const { project, page } = seedProject();
        openPage(project, page);
        unregister = registerPageOutline(page.key, controllerFor(viewModelFor(page)));
        renderOutline([page.id]);

        expect(await navigateToOutlineItem(project, "generated-table-row-7", { timeoutMs: 2000 })).toBe(false);
        expect(await navigateToOutlineItem(project, undefined, { timeoutMs: 2000 })).toBe(false);
        expect(await navigateToOutlineItem(undefined, "anything", { timeoutMs: 2000 })).toBe(false);
        expect(goto).not.toHaveBeenCalled();
    });

    it("gives up without throwing when the destination never renders the item", async () => {
        const { project, page, task } = seedProject();
        openPage(project, page);
        unregister = registerPageOutline(page.key, controllerFor(viewModelFor(page)));
        renderOutline([page.id]); // the target row is never drawn

        expect(await navigateToOutlineItem(project, task.key, { timeoutMs: 600 })).toBe(false);
    });
});
