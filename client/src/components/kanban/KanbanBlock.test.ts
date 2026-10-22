import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Project } from "../../schema/app-schema";
import { createKanban, getKanbanRegistry, removeKanban } from "../../services/yjstable/kanbanDocs";
import KanbanBlock from "./KanbanBlock.svelte";

function setup() {
    const project = Project.createInstance("Kanban setup");
    const page = project.addPage("Page", "tester");
    const host = page.items.addNode("tester");
    host.componentType = "kanban";
    return { project, host, node: host.tree.getNodeValueFromKey(host.key) as Y.Map<unknown> };
}

describe("Kanban block setup lifecycle", () => {
    it("observes live source choices and switching modes never creates objects", async () => {
        const { project, host } = setup();
        const view = render(KanbanBlock, { props: { item: host } });
        expect(view.getByTestId("kanban-create-panel")).toBeTruthy();
        await fireEvent.click(view.getByRole("button", { name: /^Existing Kanban$/ }));
        const id = createKanban(project.ydoc, { name: "Live board" });
        await waitFor(() => expect(view.getByRole("option", { name: new RegExp(id) })).toBeTruthy());
        removeKanban(project.ydoc, id);
        await waitFor(() => expect(view.queryByRole("option", { name: new RegExp(id) })).toBeNull());
        await fireEvent.click(view.getByRole("button", { name: /^New Table$/ }));
        expect(getKanbanRegistry(project.ydoc).size).toBe(0);
        expect(project.ydoc.getMap("yjsTables").size).toBe(0);
        view.unmount();
    });
    it("keeps a deleted bound board unavailable without offering setup or repairing it", async () => {
        const { project, host, node } = setup();
        const id = createKanban(project.ydoc, { name: "Bound" });
        node.set("kanbanId", id);
        const view = render(KanbanBlock, { props: { item: host } });
        await waitFor(() => expect(view.getByTestId("kanban-board")).toBeTruthy());
        removeKanban(project.ydoc, id);
        await waitFor(() => expect(view.getByTestId("kanban-missing").textContent).toContain("unavailable"));
        expect(view.queryByTestId("kanban-create-panel")).toBeNull();
        expect(node.get("kanbanId")).toBe(id);
        expect(getKanbanRegistry(project.ydoc).size).toBe(0);
        view.unmount();
    });
    it("refuses setup on a read-only surface without creating definitions", async () => {
        const { project, host } = setup();
        const view = render(KanbanBlock, { props: { item: host, isReadOnly: true } });
        await fireEvent.click(view.getByTestId("yjs-table-create"));
        await waitFor(() => expect(view.getByTestId("yjs-table-create-error")).toBeTruthy());
        expect(project.ydoc.getMap("yjsTables").size).toBe(0);
        expect(getKanbanRegistry(project.ydoc).size).toBe(0);
        view.unmount();
    });
});
