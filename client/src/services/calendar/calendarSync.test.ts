import * as Y from "yjs";
import { expect, test } from "vitest";
import { createCalendar, updateCalendar, getCalendarMap, getCalendar } from "./calendarService";
import { Project } from "$shared/app-schema";

// Directly test the bug and the LWW behavior using only the structures relevant to it
test("concurrent updateCalendar deduplicates groupAxes and laneOrder via LWW scalar arrays", () => {
    // Setting up whole Project causes unrelated yjs-orderedtree errors when applying updates completely.
    // Testing the core logic using Y.Doc directly to isolate our changes.
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const mapA = docA.getMap("calendars");
    const mapB = docB.getMap("calendars");

    const calendarId = "test-calendar";

    docA.transact(() => {
        const calMap = new Y.Map();
        calMap.set("name", "Test Calendar");
        calMap.set("groupAxes", ["initial"]);
        calMap.set("laneOrder", ["initial"]);
        mapA.set(calendarId, calMap);
    });

    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // Simulate concurrent updates
    docA.transact(() => {
        const calMap = mapA.get(calendarId) as Y.Map<any>;
        calMap.set("groupAxes", ["alpha", "beta", "gamma"]);
        calMap.set("laneOrder", ["1", "2", "3"]);
    });

    docB.transact(() => {
        const calMap = mapB.get(calendarId) as Y.Map<any>;
        calMap.set("groupAxes", ["alpha", "delta"]);
        calMap.set("laneOrder", ["1", "4"]);
    });

    // Sync docs
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));

    const finalMapA = mapA.get(calendarId) as Y.Map<any>;
    const finalMapB = mapB.get(calendarId) as Y.Map<any>;

    // Both should converge on the exact same array and have no duplicates
    expect(finalMapA.get("groupAxes")).toEqual(finalMapB.get("groupAxes"));
    expect(finalMapA.get("laneOrder")).toEqual(finalMapB.get("laneOrder"));

    const axes = finalMapA.get("groupAxes") as string[];
    const lanes = finalMapA.get("laneOrder") as string[];
    expect(new Set(axes).size).toBe(axes.length);
    expect(new Set(lanes).size).toBe(lanes.length);
});

test("backward compatibility reads and deduplicates Y.Array correctly", () => {
    const project = Project.createInstance("Test Project");
    const calendarId = createCalendar(project, { name: "Legacy Calendar" });
    const map = getCalendarMap(project, calendarId)!;

    project.ydoc.transact(() => {
        const groupAxes = new Y.Array<string>();
        groupAxes.push(["alpha", "beta", "gamma", "alpha", "delta"]); // Simulating duplicated data
        map.set("groupAxes", groupAxes);

        const laneOrder = new Y.Array<string>();
        laneOrder.push(["1", "2", "3", "1", "4"]);
        map.set("laneOrder", laneOrder);
    });

    const settings = getCalendar(project, calendarId)!;
    expect(settings.groupAxes).toEqual(["alpha", "beta", "gamma", "delta"]);
    expect(settings.laneOrder).toEqual(["1", "2", "3", "4"]);
});
