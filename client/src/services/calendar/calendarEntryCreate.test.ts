// `createCalendarEntry` always targets the items relation directly, since
// creating a calendar entry always means creating a new outline item (#4349).
// The unit tests below check the values shape it builds for each input shape;
// the integration test at the bottom exercises the real `ItemsRelationProvider`
// end to end, the way `itemsRelationWrite.test.ts` does for a bare INSERT.

import { afterAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Items, Project } from "../../schema/app-schema";
import { ITEMS_RELATION_NAME, ItemsRelationProvider } from "../yjstable/itemsRelation";
import { resetPgliteForTests } from "../yjstable/pgliteService";
import type { RelationProvider, RelationWrite } from "../yjstable/relationProvider";
import { RelationWriteError, TABLE_RELATION_CAPABILITIES } from "../yjstable/relationProvider";
import { createCalendarEntry } from "./calendarEntryCreate";

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

function resolverFor(provider: RelationProvider | undefined) {
    return { resolveRelation: async (name: string) => name === ITEMS_RELATION_NAME ? provider : undefined };
}

describe("createCalendarEntry (values shape)", () => {
    it("writes just the title when no dates are given", async () => {
        const provider = new RecordingProvider();
        await createCalendarEntry(resolverFor(provider), { parentKey: "page-1" }, {
            title: "Untitled task",
            allDay: false,
        });
        expect(provider.writes).toEqual([
            { op: "INSERT", values: { text: "Untitled task" }, destination: { parentKey: "page-1" } },
        ]);
    });

    it("writes start_on for an all-day start", async () => {
        const provider = new RecordingProvider();
        await createCalendarEntry(resolverFor(provider), { parentKey: "page-1" }, {
            title: "Conference",
            allDay: true,
            startMs: Date.parse("2026-08-01T00:00:00Z"),
        });
        expect(provider.writes).toEqual([
            {
                op: "INSERT",
                values: { text: "Conference", all_day: true, start_on: "2026-08-01" },
                destination: { parentKey: "page-1" },
            },
        ]);
    });

    it("writes start_at for a timed start", async () => {
        const provider = new RecordingProvider();
        await createCalendarEntry(resolverFor(provider), { parentKey: "page-1" }, {
            title: "Standup",
            allDay: false,
            startMs: Date.parse("2026-08-01T09:00:00Z"),
        });
        expect(provider.writes).toEqual([
            {
                op: "INSERT",
                values: { text: "Standup", all_day: false, start_at: "2026-08-01T09:00:00.000Z" },
                destination: { parentKey: "page-1" },
            },
        ]);
    });

    it("writes due independently of start", async () => {
        const provider = new RecordingProvider();
        await createCalendarEntry(resolverFor(provider), { parentKey: "page-1" }, {
            title: "File taxes",
            allDay: true,
            dueMs: Date.parse("2026-04-15T00:00:00Z"),
        });
        expect(provider.writes).toEqual([
            {
                op: "INSERT",
                values: { text: "File taxes", due: "2026-04-15" },
                destination: { parentKey: "page-1" },
            },
        ]);
    });

    it("throws when the items relation is not available", async () => {
        await expect(
            createCalendarEntry(resolverFor(undefined), { parentKey: "page-1" }, { title: "X", allDay: false }),
        ).rejects.toThrow(RelationWriteError);
    });
});

afterAll(async () => {
    await resetPgliteForTests();
});

describe("createCalendarEntry (real ItemsRelationProvider)", { timeout: 30000 }, () => {
    it("creates a new item under the chosen destination, with the given title and start", async () => {
        const projectDoc = new Y.Doc({ guid: "proj-calendar-entry-create" });
        const project = Project.fromDoc(projectDoc);
        const page = new Items(projectDoc, project.tree, "root").addNode("tester");
        page.text = "Tasks";

        const provider = new ItemsRelationProvider({ projectDoc, pgSchema: "test_schema_create" });
        expect(await provider.materialize()).toBe(true);
        try {
            await createCalendarEntry(resolverFor(provider), { parentKey: page.key }, {
                title: "Plan launch",
                allDay: true,
                startMs: Date.parse("2026-08-01T00:00:00Z"),
            });

            const created = [...new Items(projectDoc, project.tree, page.key)]
                .find((child) => child.text === "Plan launch");
            expect(created).toBeDefined();
            expect(created?.start).toBe("2026-08-01");
            expect(created?.allDay).toBe(true);
        } finally {
            provider.dispose();
        }
    });

    it("rejects a destination that does not exist, creating nothing", async () => {
        const projectDoc = new Y.Doc({ guid: "proj-calendar-entry-create-bad-dest" });
        const provider = new ItemsRelationProvider({ projectDoc, pgSchema: "test_schema_create_bad" });
        expect(await provider.materialize()).toBe(true);
        try {
            await expect(
                createCalendarEntry(resolverFor(provider), { parentKey: "no-such-item" }, {
                    title: "X",
                    allDay: false,
                }),
            ).rejects.toThrow(RelationWriteError);
        } finally {
            provider.dispose();
        }
    });
});
