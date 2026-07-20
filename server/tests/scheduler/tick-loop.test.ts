import { expect } from "chai";
import sinon from "sinon";
import { runScheduleTick } from "../../src/scheduler/tick-loop.js";
import BetterSqlite3 from "better-sqlite3";
import * as Y from "yjs";
import { Hocuspocus } from "@hocuspocus/server";

describe("Tick Loop", () => {
    let db: BetterSqlite3.Database;
    let hocuspocusMock: any;

    beforeEach(() => {
        db = new BetterSqlite3(":memory:");
        db.prepare(`
            CREATE TABLE IF NOT EXISTS schedule_index (
                room            TEXT,
                rule_id         TEXT,
                target_table_id TEXT,
                timezone        TEXT,
                rrule           TEXT,
                dtstart         TEXT,
                next_run_at     TEXT,
                occurrence_seq  INTEGER,
                state           TEXT,
                PRIMARY KEY (room, rule_id)
            )
        `).run();

        hocuspocusMock = {
            openDirectConnection: sinon.stub(),
        };
    });

    it("should process no rules if none are due", async () => {
        await runScheduleTick(db, hocuspocusMock as unknown as Hocuspocus);
        expect(hocuspocusMock.openDirectConnection.called).to.be.false;
    });

    it("should update next_run_at without catchUp", async () => {
        // Insert a due rule
        db.prepare(`
            INSERT INTO schedule_index (room, rule_id, target_table_id, timezone, rrule, dtstart, next_run_at, occurrence_seq, state)
            VALUES ('projects/demo', 'r1', 't1', 'UTC', 'FREQ=DAILY', '2025-01-01T00:00:00', '2025-01-01T00:00:00.000Z', 0, 'active')
        `).run();

        const doc = new Y.Doc();
        const schedulesMap = doc.getMap("schedules");
        const ruleMap = new Y.Map();
        ruleMap.set("catchUp", false);
        ruleMap.set("sql", "SELECT 1;");
        ruleMap.set("enabled", true);
        schedulesMap.set("r1", ruleMap);

        const targetTableDoc = new Y.Doc();
        targetTableDoc.getText("schema").insert(0, "CREATE TABLE t1 (id TEXT PRIMARY KEY, val INTEGER);");
        targetTableDoc.getMap("data");

        hocuspocusMock.openDirectConnection.callsFake(async (room: string) => {
            return {
                document: room === "projects/demo" ? doc : targetTableDoc,
                disconnect: async () => {},
                transact: (fn: any) => fn(room === "projects/demo" ? doc : targetTableDoc)
            };
        });

        await runScheduleTick(db, hocuspocusMock as unknown as Hocuspocus);

        const row = db.prepare("SELECT * FROM schedule_index WHERE rule_id = 'r1'").get() as any;
        expect(new Date(row.next_run_at!).getTime()).to.be.greaterThanOrEqual(new Date('2025-01-02T00:00:00.000Z').getTime());
        expect(row.state).to.equal("active");
    }, 15000);
});
