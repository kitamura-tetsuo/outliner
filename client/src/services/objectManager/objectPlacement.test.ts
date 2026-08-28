import { Project } from "$shared/app-schema";
import { describe, expect, it } from "vitest";
import { getItemCalendarId } from "../calendar/calendarBinding";
import { createCalendar } from "../calendar/calendarService";
import { createGrid, getGridHandles } from "../yjstable/gridDocs";
import { getItemGridId } from "../yjstable/itemBinding";
import {
    OBJECT_PLACEMENT_MIME,
    placeObjectOnPage,
    readObjectPlacementDrag,
    writeObjectPlacementDrag,
} from "./objectPlacement";

describe("Object Manager Page placement", () => {
    it("places the same Grid definition more than once", () => {
        const project = Project.createInstance("Project");
        const page = project.addPage("Inbox", "user");
        const gridId = createGrid(project.ydoc, "table", { name: "Tasks" });

        placeObjectOnPage(project.ydoc, page.id, "grid", gridId, "user");
        placeObjectOnPage(project.ydoc, page.id, "grid", gridId, "user");

        expect(page.items.length).toBe(2);
        expect([...page.items].map(getItemGridId)).toEqual([gridId, gridId]);
        expect(getGridHandles(project.ydoc, gridId)).toBeDefined();
    });

    it("places an existing Calendar without duplicating its definition", () => {
        const project = Project.createInstance("Project");
        const page = project.addPage("Planning", "user");
        const calendarId = createCalendar(project, { name: "Roadmap" });

        placeObjectOnPage(project.ydoc, page.id, "calendar", calendarId, "user");

        expect(project.calendars.size).toBe(1);
        expect(page.items.at(0)?.componentType).toBe("calendar");
        expect(getItemCalendarId(page.items.at(0)!)).toBe(calendarId);
    });

    it("uses a distinct, validated native drag payload", () => {
        let payload = "";
        const transfer = {
            types: [OBJECT_PLACEMENT_MIME],
            effectAllowed: "uninitialized",
            setData: (_type: string, value: string) => payload = value,
            getData: () => payload,
        } as unknown as DataTransfer;
        const event = { dataTransfer: transfer } as DragEvent;

        writeObjectPlacementDrag(event, "grid", "grid-1");
        expect(readObjectPlacementDrag(event)).toEqual({
            kind: "object-placement",
            objectType: "grid",
            objectId: "grid-1",
        });
    });
});
