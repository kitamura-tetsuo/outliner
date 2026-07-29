import type { Item } from "$shared/app-schema";
import { Items, Project } from "$shared/app-schema";
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it } from "vitest";
import { getDestinationHistory } from "../../services/calendar/calendarDestinationHistory";
import { ITEMS_RELATION_NAME } from "../../services/yjstable/itemsRelation";
import type { RelationProvider, RelationWrite } from "../../services/yjstable/relationProvider";
import { TABLE_RELATION_CAPABILITIES } from "../../services/yjstable/relationProvider";
import CalendarCreateEntryDialog from "./CalendarCreateEntryDialog.svelte";

class RecordingProvider implements RelationProvider {
    readonly sqlName = ITEMS_RELATION_NAME;
    readonly capabilities = TABLE_RELATION_CAPABILITIES;
    writes: RelationWrite[] = [];
    async materialize() {
        return true;
    }
    async applyWrite(write: RelationWrite) {
        this.writes.push(write);
    }
    dispose() {}
}

function resolverFor(provider: RelationProvider) {
    return { resolveRelation: async (name: string) => name === ITEMS_RELATION_NAME ? provider : undefined };
}

describe("CalendarCreateEntryDialog", () => {
    let project: Project;
    let pageA: Item;
    let pageB: Item;

    beforeEach(() => {
        localStorage.clear();
        project = Project.createInstance("Test Project");
        pageA = new Items(project.ydoc, project.tree, "root").addNode("tester");
        pageA.text = "Tasks";
        pageB = new Items(project.ydoc, project.tree, "root").addNode("tester");
        pageB.text = "Notes";
    });

    it("lists every page as a destination candidate", () => {
        const provider = new RecordingProvider();
        const { getByTestId } = render(CalendarCreateEntryDialog, {
            props: {
                project,
                projectId: "proj-1",
                resolver: resolverFor(provider),
                onCreated: () => {},
                onCancel: () => {},
            },
        });

        expect(getByTestId(`calendar-create-destination-option-${pageA.key}`)).toBeTruthy();
        expect(getByTestId(`calendar-create-destination-option-${pageB.key}`)).toBeTruthy();
    });

    it("disables Create until a destination is chosen", async () => {
        const provider = new RecordingProvider();
        const { getByTestId } = render(CalendarCreateEntryDialog, {
            props: {
                project,
                projectId: "proj-1",
                resolver: resolverFor(provider),
                onCreated: () => {},
                onCancel: () => {},
            },
        });

        expect((getByTestId("calendar-create-submit") as HTMLButtonElement).disabled).toBe(true);

        await fireEvent.change(getByTestId("calendar-create-destination-select"), { target: { value: pageA.key } });
        expect((getByTestId("calendar-create-submit") as HTMLButtonElement).disabled).toBe(false);
    });

    it("cancelling calls onCancel and creates nothing", async () => {
        const provider = new RecordingProvider();
        let cancelled = false;
        const { getByTestId } = render(CalendarCreateEntryDialog, {
            props: {
                project,
                projectId: "proj-1",
                resolver: resolverFor(provider),
                onCreated: () => {},
                onCancel: () => {
                    cancelled = true;
                },
            },
        });

        await fireEvent.click(getByTestId("calendar-create-cancel"));
        expect(cancelled).toBe(true);
        expect(provider.writes).toHaveLength(0);
    });

    it("submitting creates the entry under the chosen destination and records it to history", async () => {
        const provider = new RecordingProvider();
        let created = false;
        const { getByTestId } = render(CalendarCreateEntryDialog, {
            props: {
                project,
                projectId: "proj-history",
                resolver: resolverFor(provider),
                onCreated: () => {
                    created = true;
                },
                onCancel: () => {},
            },
        });

        await fireEvent.input(getByTestId("calendar-create-title-input"), { target: { value: "Plan launch" } });
        await fireEvent.change(getByTestId("calendar-create-destination-select"), { target: { value: pageA.key } });
        await fireEvent.click(getByTestId("calendar-create-submit"));

        await waitFor(() => expect(created).toBe(true));
        expect(provider.writes).toEqual([
            { op: "INSERT", values: { text: "Plan launch" }, destination: { parentKey: pageA.key } },
        ]);
        expect(getDestinationHistory("proj-history")).toEqual([{ parentKey: pageA.key, label: "Tasks" }]);
    });

    it("offers a previously recorded destination as Recent, ahead of the plain page list", () => {
        // Simulate a prior successful create by seeding history directly, the
        // way `recordDestination` would have left it.
        localStorage.setItem(
            "calendarDestinationHistory:proj-recent",
            JSON.stringify([{ parentKey: pageB.key, label: "Notes" }]),
        );
        const provider = new RecordingProvider();
        const { getByTestId } = render(CalendarCreateEntryDialog, {
            props: {
                project,
                projectId: "proj-recent",
                resolver: resolverFor(provider),
                onCreated: () => {},
                onCancel: () => {},
            },
        });

        expect(getByTestId(`calendar-create-destination-recent-${pageB.key}`)).toBeTruthy();
    });

    it("surfaces a write error rather than closing silently", async () => {
        class FailingProvider extends RecordingProvider {
            async applyWrite(): Promise<void> {
                throw new Error("destination does not exist");
            }
        }
        const provider = new FailingProvider();
        let created = false;
        const { getByTestId } = render(CalendarCreateEntryDialog, {
            props: {
                project,
                projectId: "proj-err",
                resolver: resolverFor(provider),
                onCreated: () => {
                    created = true;
                },
                onCancel: () => {},
            },
        });

        await fireEvent.change(getByTestId("calendar-create-destination-select"), { target: { value: pageA.key } });
        await fireEvent.click(getByTestId("calendar-create-submit"));

        await waitFor(() => expect(getByTestId("calendar-create-error")).toBeTruthy());
        expect(created).toBe(false);
    });
});
