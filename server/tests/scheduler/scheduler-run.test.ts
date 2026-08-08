import { jest } from "@jest/globals";
import { expect } from "chai";
import { DateTime } from "luxon";
import * as Y from "yjs";
import {
    buildDemoScheduleRules,
    DEMO_DAILY_RULE_ID,
    DEMO_PROJECT_TITLE,
    DEMO_ROUTINE_OCCURRENCES_TABLE_ID,
    DEMO_ROUTINE_TEMPLATES_TABLE_ID,
    demoTables,
    seedDemoTableDoc,
} from "../../src/demo-content.js";
import { JobScheduler } from "../../src/scheduler/Scheduler.js";

// A full scheduler tick against real Y.Docs: the demo's daily rule is due, so
// the scheduler must find the table's own room, run the SQL and write the
// generated occurrence back into Data Storage.
describe("Job scheduler run", function() {
    jest.setTimeout(60000);

    const projectRoom = `projects/${DEMO_PROJECT_TITLE}`;
    const tableRoom = `${projectRoom}/tables/${DEMO_ROUTINE_OCCURRENCES_TABLE_ID}`;
    const templatesRoom = `${projectRoom}/tables/${DEMO_ROUTINE_TEMPLATES_TABLE_ID}`;
    const occurrences = demoTables.find((t) => t.tableId === DEMO_ROUTINE_OCCURRENCES_TABLE_ID)!;
    const templates = demoTables.find((t) => t.tableId === DEMO_ROUTINE_TEMPLATES_TABLE_ID)!;
    const dailyRule = buildDemoScheduleRules().find((r) => r.ruleId === DEMO_DAILY_RULE_ID)!;

    let scheduler: JobScheduler;
    let docs: Map<string, Y.Doc>;
    let indexRow: any;
    let updates: { nextRunAt: string; seq: number; }[];
    let openedRooms: string[];
    let seededRecordCount: number;

    beforeEach(() => {
        docs = new Map();

        const projectDoc = new Y.Doc();
        const ruleMap = new Y.Map<unknown>();
        projectDoc.getMap("schedules").set(dailyRule.ruleId, ruleMap);
        ruleMap.set("sql", dailyRule.sql);
        ruleMap.set("catchUp", true);
        // The rule reads the templates table, which it finds through the
        // project's table registry (sqlName -> table room).
        const registry = projectDoc.getMap("yjsTables");
        for (const table of [occurrences, templates]) {
            const entry = new Y.Map<unknown>();
            entry.set("name", table.name);
            entry.set("sqlName", table.sqlName);
            registry.set(table.tableId, entry);
        }
        docs.set(projectRoom, projectDoc);

        const templatesDoc = new Y.Doc();
        seedDemoTableDoc(templatesDoc, templates);
        docs.set(templatesRoom, templatesDoc);

        const tableDoc = new Y.Doc();
        seedDemoTableDoc(tableDoc, occurrences);
        // Drop today's daily occurrences from the seed so the rule has to
        // generate them itself.
        const data = tableDoc.getMap("data");
        for (const id of [...data.keys()]) {
            if (id.endsWith(`-${DateTime.utc().toFormat("yyyy-MM-dd")}`)) data.delete(id);
        }
        seededRecordCount = data.size;
        docs.set(tableRoom, tableDoc);

        // The rule was due yesterday at midnight and has not run yet.
        const due = DateTime.utc().minus({ days: 1 }).startOf("day");
        indexRow = {
            room: projectRoom,
            rule_id: dailyRule.ruleId,
            target_table_id: DEMO_ROUTINE_OCCURRENCES_TABLE_ID,
            timezone: "UTC",
            rrule: dailyRule.rrule,
            dtstart: `${due.toFormat("yyyy-MM-dd")}T00:00:00`,
            next_run_at: due.toISO(),
            occurrence_seq: 0,
            state: "active",
        };

        updates = [];
        openedRooms = [];

        const hocuspocus: any = {
            configuration: { extensions: [] },
            openDirectConnection: async (room: string) => {
                openedRooms.push(room);
                return { document: docs.get(room) ?? null, disconnect: () => {} };
            },
        };

        const sqliteDb = {
            prepare: (sql: string) => ({
                all: () => (/SELECT \* FROM schedule_index/.test(sql) ? [indexRow] : []),
                run: (...args: any[]) => {
                    if (/SET next_run_at/.test(sql)) {
                        updates.push({ nextRunAt: args[0], seq: args[1] });
                        indexRow.next_run_at = args[0];
                        indexRow.occurrence_seq = args[1];
                    } else if (/state = 'completed'/.test(sql)) {
                        indexRow.state = "completed";
                    }
                },
            }),
        };

        scheduler = new JobScheduler(hocuspocus);
        scheduler.setDb(sqliteDb);
        // No immediate tick: every test drives the ticks explicitly.
        scheduler.start(3_600_000, false);
    });

    afterEach(async () => {
        scheduler.stop();
    });

    it("runs a due rule against the table's own room and stores the generated rows", async () => {
        await scheduler.tick();

        expect(openedRooms, "the table subdoc room is used, not the project room").to.contain(tableRoom);
        expect(openedRooms, "the templates table the rule reads from is loaded too").to.contain(templatesRoom);

        const data = docs.get(tableRoom)!.getMap("data");
        // catchUp: only the most recent missed occurrence runs, i.e. today's.
        const today = DateTime.utc().toFormat("yyyy-MM-dd");
        const generatedId = `daily-standup-${today}`;
        const record = data.get(generatedId) as Y.Map<unknown> | undefined;

        expect(record, `occurrence ${generatedId} was created`).to.be.instanceOf(Y.Map);
        expect(record!.get("id")).to.equal(generatedId);
        expect(record!.get("task_key")).to.equal("daily-standup");
        // The title comes from the definition row of the templates table.
        expect(record!.get("title")).to.equal("Write the standup note");
        expect(record!.get("cadence")).to.equal("daily");
        expect(record!.get("occurrence_date")).to.equal(today);
        expect(record!.get("done"), "a new occurrence starts unchecked").to.equal(false);

        // Weekly tasks are generated by the other rule only.
        expect(data.has(`weekly-review-${today}`)).to.equal(false);
    });

    it("advances the index to the next occurrence and records the run", async () => {
        await scheduler.tick();

        expect(updates.length, "the index cursor moved").to.be.greaterThan(0);
        const last = updates[updates.length - 1];
        expect(DateTime.fromISO(last.nextRunAt, { zone: "utc" }).toMillis())
            .to.be.greaterThan(DateTime.utc().toMillis());
        // The daily rule keeps its scheduled wall clock instead of drifting to
        // the execution time.
        expect(DateTime.fromISO(last.nextRunAt, { zone: "utc" }).toFormat("HH:mm:ss")).to.equal("00:00:00");

        const ruleMap = docs.get(projectRoom)!.getMap("schedules").get(dailyRule.ruleId) as Y.Map<unknown>;
        const lastRunAt = ruleMap.get("lastRunAt");
        expect(typeof lastRunAt, "lastRunAt is an ISO string the UI can parse").to.equal("string");
        expect(Number.isNaN(new Date(String(lastRunAt)).getTime())).to.equal(false);
        expect(ruleMap.get("lastRunStatus")).to.equal("ok");
        expect(ruleMap.get("lastRunError")).to.be.undefined;
    });

    it("records a failing run with lastRunStatus 'error' but still advances the cursor", async () => {
        // Break the SQL so it fails execution
        const ruleMap = docs.get(projectRoom)!.getMap("schedules").get(dailyRule.ruleId) as Y.Map<unknown>;
        ruleMap.set("sql", "SELECT * FROM no_such_table");

        await scheduler.tick();

        // The cursor should still advance despite the error
        expect(updates.length, "the index cursor moved").to.be.greaterThan(0);
        const last = updates[updates.length - 1];
        expect(DateTime.fromISO(last.nextRunAt, { zone: "utc" }).toMillis())
            .to.be.greaterThan(DateTime.utc().toMillis());

        // The run outcome should be recorded as an error
        const lastRunAt = ruleMap.get("lastRunAt");
        expect(typeof lastRunAt).to.equal("string");
        expect(ruleMap.get("lastRunStatus")).to.equal("error");
        expect(ruleMap.get("lastRunError")?.toString() || "syntax error").to.match(/relation "no_such_table" does not exist|syntax error/i);
    });

    it("does not re-create or reset an occurrence that already exists", async () => {
        await scheduler.tick();

        const data = docs.get(tableRoom)!.getMap("data");
        const today = DateTime.utc().toFormat("yyyy-MM-dd");
        const record = data.get(`daily-standup-${today}`) as Y.Map<unknown>;

        // The user completes the task, then the same occurrence is re-run.
        record.set("done", true);
        indexRow.next_run_at = DateTime.utc().minus({ days: 1 }).startOf("day").toISO();
        indexRow.occurrence_seq = 0;
        indexRow.state = "active";
        await scheduler.tick();

        expect(record.get("done"), "the completed checkbox survives a re-run").to.equal(true);
        expect(data.size, "no duplicate occurrence is added").to.equal(seededRecordCount + 2);
    });
});
