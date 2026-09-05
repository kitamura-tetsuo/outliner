import Database from "better-sqlite3";
import { expect } from "chai";
import { DateTime } from "luxon";
import { default as rruleImport } from "rrule";
import * as Y from "yjs";
import { summarizeScheduleNextRun, summarizeScheduleRun } from "../../../shared/src/services/scheduleStatus.js";
import {
    buildDemoScheduleRules,
    DEMO_DAILY_RULE_ID,
    DEMO_PROJECT_TITLE,
    DEMO_ROUTINE_OCCURRENCES_TABLE_ID,
    DEMO_ROUTINE_TEMPLATES_TABLE_ID,
    demoTables,
    seedDemoTableDoc,
} from "../../src/demo-content.js";
import {
    handleStoreDocumentForSchedules,
    initializeScheduleIndex,
    type ScheduleIndexRow,
} from "../../src/scheduler/schedule-indexer.js";
import { JobScheduler } from "../../src/scheduler/Scheduler.js";

// rrule publishes a CommonJS default namespace to this test loader.
const { rrulestr } = rruleImport;

/**
 * The Schedules Manager's status columns, end to end (issue #5290).
 *
 * Every assertion here reads the values the manager renders — through the same
 * shared derivation the Svelte table uses — but produces them from the
 * production origins: the real recurrence indexer writing the real
 * `schedule_index`, and the real `JobScheduler` executing the rule's SQL and
 * writing its telemetry into the real Schedule document.
 */
describe("Schedules Manager status (production path)", function() {
    this.timeout(60000);

    const projectRoom = `projects/${DEMO_PROJECT_TITLE}`;
    const tableRoom = `${projectRoom}/tables/${DEMO_ROUTINE_OCCURRENCES_TABLE_ID}`;
    const templatesRoom = `${projectRoom}/tables/${DEMO_ROUTINE_TEMPLATES_TABLE_ID}`;
    const occurrences = demoTables.find(t => t.tableId === DEMO_ROUTINE_OCCURRENCES_TABLE_ID)!;
    const templates = demoTables.find(t => t.tableId === DEMO_ROUTINE_TEMPLATES_TABLE_ID)!;
    const dailyRule = buildDemoScheduleRules().find(r => r.ruleId === DEMO_DAILY_RULE_ID)!;
    // Two days back, so the rule is both due now and — because it has never
    // run — carries an overdue first occurrence as its authoritative cursor.
    const dtstart = `${DateTime.utc().minus({ days: 2 }).toFormat("yyyy-MM-dd")}T00:00:00`;
    // Midnight today: exactly one occurrence is in the past, so a tick
    // dispatches exactly one execution and the occurrence it consumes is
    // unambiguous.
    const singleOccurrenceDtstart = `${DateTime.utc().toFormat("yyyy-MM-dd")}T00:00:00`;

    let db: Database.Database;
    let docs: Map<string, Y.Doc>;
    let scheduler: JobScheduler;
    let hocuspocus: any;

    function ruleMapOf(doc: Y.Doc): Y.Map<unknown> {
        return doc.getMap("schedules").get(DEMO_DAILY_RULE_ID) as Y.Map<unknown>;
    }

    /** The exact fields the Schedules Manager mirrors out of the Schedule. */
    function managerSnapshot(doc: Y.Doc = docs.get(projectRoom)!) {
        const rule = ruleMapOf(doc);
        const telemetry = {
            enabled: rule.get("enabled") as boolean | undefined,
            lastRunStartedAt: rule.get("lastRunStartedAt") as string | undefined,
            lastRunStatus: rule.get("lastRunStatus") as string | undefined,
            lastRunError: rule.get("lastRunError") as string | undefined,
            lastRunAt: rule.get("lastRunAt") as string | undefined,
            lastSuccessfulRunAt: rule.get("lastSuccessfulRunAt") as string | undefined,
            schedulerState: rule.get("schedulerState") as string | undefined,
            schedulerNextRunAt: rule.get("schedulerNextRunAt") as string | undefined,
        };
        return { ...summarizeScheduleRun(telemetry), next: summarizeScheduleNextRun(telemetry), raw: telemetry };
    }

    function indexRow(): ScheduleIndexRow {
        return db.prepare(`SELECT * FROM schedule_index WHERE room = ? AND rule_id = ?`)
            .get(projectRoom, DEMO_DAILY_RULE_ID) as ScheduleIndexRow;
    }

    /** Run the real onStoreDocument indexing hook over the project document. */
    function storeProjectDocument(doc: Y.Doc = docs.get(projectRoom)!) {
        handleStoreDocumentForSchedules(
            { documentName: projectRoom, document: doc } as any,
            db,
        );
    }

    function buildProjectDoc(
        options: { dtstart?: string; rrule?: string; } = {},
    ): Y.Doc {
        const projectDoc = new Y.Doc();
        const ruleMap = new Y.Map<unknown>();
        projectDoc.getMap("schedules").set(dailyRule.ruleId, ruleMap);
        ruleMap.set("name", dailyRule.name);
        ruleMap.set("targetTableId", DEMO_ROUTINE_OCCURRENCES_TABLE_ID);
        ruleMap.set("sql", dailyRule.sql);
        ruleMap.set("rrule", options.rrule ?? dailyRule.rrule);
        ruleMap.set("dtstart", options.dtstart ?? dtstart);
        ruleMap.set("timezone", "UTC");
        ruleMap.set("enabled", true);
        ruleMap.set("catchUp", true);

        const registry = projectDoc.getMap("yjsTables");
        for (const table of [occurrences, templates]) {
            const entry = new Y.Map<unknown>();
            entry.set("name", table.name);
            entry.set("sqlName", table.sqlName);
            registry.set(table.tableId, entry);
        }
        return projectDoc;
    }

    function buildDocs(projectDoc: Y.Doc): Map<string, Y.Doc> {
        const map = new Map<string, Y.Doc>();
        map.set(projectRoom, projectDoc);

        const templatesDoc = new Y.Doc();
        seedDemoTableDoc(templatesDoc, templates);
        map.set(templatesRoom, templatesDoc);

        const tableDoc = new Y.Doc();
        seedDemoTableDoc(tableDoc, occurrences);
        const data = tableDoc.getMap("data");
        for (const id of [...data.keys()]) {
            if (id.endsWith(`-${DateTime.utc().toFormat("yyyy-MM-dd")}`)) data.delete(id);
        }
        map.set(tableRoom, tableDoc);
        return map;
    }

    function buildScheduler(): JobScheduler {
        hocuspocus = {
            configuration: { extensions: [] },
            openDirectConnection: async (room: string) => ({
                document: docs.get(room) ?? null,
                disconnect: function() {},
            }),
            // Hocuspocus writes a direct-connection transaction into the
            // in-memory document and stores it on a debounce, so "the
            // transaction returned" is not "the result is durable". The
            // scheduler forces the store through this hook; `persisted` is what
            // a restart would actually read back off disk.
            storeDocumentHooks: async (document: Y.Doc) => {
                persisted.set(document, Y.encodeStateAsUpdate(document));
            },
        };
        const created = new JobScheduler(hocuspocus);
        created.setDb(db);
        // No immediate tick: every test drives the ticks explicitly.
        created.start(3_600_000, false);
        return created;
    }

    /** The last durably stored bytes of each document. */
    let persisted: Map<Y.Doc, Uint8Array>;

    /** Reload a document from storage, the way a restarted process would. */
    function reloadFromStorage(doc: Y.Doc): Y.Doc {
        const update = persisted.get(doc);
        expect(update, "the document had reached storage").to.not.be.undefined;
        const reloaded = new Y.Doc();
        Y.applyUpdate(reloaded, update!);
        return reloaded;
    }

    /** The scheduler's durable record that an execution still owes a published result. */
    function owedRunRow(): {
        run_seq: number;
        status: string | null;
        completed_at: string | null;
    } | undefined {
        return db.prepare(
            `SELECT run_seq, status, completed_at FROM schedule_active_runs WHERE room = ? AND rule_id = ?`,
        )
            .get(projectRoom, DEMO_DAILY_RULE_ID) as
                | { run_seq: number; status: string | null; completed_at: string | null; }
                | undefined;
    }

    /** Drop the rule's recurrence the way an editor save does, then re-index. */
    function clearRecurrence(projectDoc: Y.Doc): void {
        ruleMapOf(projectDoc).set("dtstart", "");
        storeProjectDocument(projectDoc);
    }

    /**
     * Re-seed the project on a different recurrence and index it from scratch
     * through the real indexer. The scheduler resolves rooms through the
     * `docs` binding on every call, so it follows the new documents.
     */
    function reseed(options: { dtstart?: string; rrule?: string; }): Y.Doc {
        const projectDoc = buildProjectDoc(options);
        docs = buildDocs(projectDoc);
        db.prepare(`DELETE FROM schedule_index`).run();
        storeProjectDocument(projectDoc);
        return projectDoc;
    }

    /**
     * Every manager snapshot the shared document passes through, captured the
     * way the manager sees them: `ScheduleListView` rebuilds its rows from one
     * `observeDeep` callback, so one callback is one rendered state.
     */
    function recordRenderedSnapshots(projectDoc: Y.Doc): ReturnType<typeof managerSnapshot>[] {
        const rendered: ReturnType<typeof managerSnapshot>[] = [];
        projectDoc.getMap("schedules").observeDeep(() => rendered.push(managerSnapshot(projectDoc)));
        return rendered;
    }

    const TERMINAL_RESULTS = ["success", "failed", "interrupted"];

    beforeEach(function() {
        db = new Database(":memory:");
        persisted = new Map();
        initializeScheduleIndex(db);
        docs = buildDocs(buildProjectDoc());
        storeProjectDocument();
        scheduler = buildScheduler();
    });

    afterEach(async function() {
        // Awaited so the next test's worker is not spawned while this one is
        // still tearing down its Postgres WASM heap.
        await scheduler.stop();
        db.close();
    });

    // AS-001 / AS-006 — the never-run row, and a cursor a naive client
    // calculation would disagree with.
    it("shows the scheduler's own overdue cursor for a Schedule that has never run", function() {
        const snapshot = managerSnapshot();

        expect(snapshot.result).to.equal("never");
        expect(snapshot.lastRunStartedAt).to.be.undefined;
        expect(snapshot.lastSuccessfulRunAt).to.be.undefined;

        expect(snapshot.next.state).to.equal("scheduled");
        expect(snapshot.next.nextRunAt).to.equal(indexRow().next_run_at);

        // The cursor is the rule's first, still unconsumed occurrence — two
        // days ago — while `rrule.after(now)` would report a future one.
        expect(DateTime.fromISO(snapshot.next.nextRunAt!).toMillis()).to.be.lessThan(DateTime.utc().toMillis());
        const naive = rrulestr(dailyRule.rrule, { dtstart: new Date(`${dtstart}Z`) }).after(new Date());
        expect(naive, "the naive client calculation returns a different instant").to.not.be.null;
        expect(new Date(snapshot.next.nextRunAt!).getTime()).to.not.equal(naive!.getTime());
    });

    // AS-002 — the start of an execution is observable as one transition, and
    // its success updates both the result and the successful-completion time.
    it("records the execution start before completion and the success after it", async function() {
        const running: { startedAt?: string; at: number; }[] = [];
        const ruleMap = ruleMapOf(docs.get(projectRoom)!);
        ruleMap.observe(() => {
            if (ruleMap.get("lastRunStatus") === "running") {
                running.push({ startedAt: ruleMap.get("lastRunStartedAt") as string, at: Date.now() });
            }
        });

        const before = Date.now();
        await scheduler.tick();
        const after = Date.now();

        // `Result = Running` and `Last run` became observable together.
        expect(running.length, "a running state was published before completion").to.be.greaterThan(0);
        expect(running[0].startedAt, "the running state carries its start instant").to.be.a("string");

        const snapshot = managerSnapshot();
        expect(snapshot.result).to.equal("success");
        expect(snapshot.startTimeUnrecorded).to.equal(false);

        const startedAt = Date.parse(snapshot.lastRunStartedAt!);
        // A real start observation: inside this test's wall clock, and not the
        // scheduled occurrence instant it was dispatched for.
        expect(startedAt).to.be.at.least(before);
        expect(startedAt).to.be.at.most(after);
        expect(snapshot.lastRunStartedAt).to.not.equal(indexRow().next_run_at);

        // The success completion time is the completion, i.e. at or after the start.
        expect(Date.parse(snapshot.lastSuccessfulRunAt!)).to.be.at.least(startedAt);

        // And the cursor advanced to the scheduler's next authoritative occurrence.
        expect(snapshot.next.state).to.equal("scheduled");
        expect(snapshot.next.nextRunAt).to.equal(indexRow().next_run_at);
        expect(DateTime.fromISO(snapshot.next.nextRunAt!).toMillis()).to.be.greaterThan(DateTime.utc().toMillis());
    });

    // AS-003 — a later failure must not erase the earlier success.
    it("keeps the previous successful completion when a later execution fails", async function() {
        await scheduler.tick();
        const succeeded = managerSnapshot();
        expect(succeeded.result).to.equal("success");
        const firstSuccessAt = succeeded.lastSuccessfulRunAt!;

        // The rule is edited to something that fails, and becomes due again.
        const ruleMap = ruleMapOf(docs.get(projectRoom)!);
        ruleMap.set("sql", "INSERT INTO no_such_table (id) VALUES (gen_random_uuid()) RETURNING *;");
        db.prepare(`UPDATE schedule_index SET next_run_at = ? WHERE room = ? AND rule_id = ?`)
            .run(DateTime.utc().minus({ minutes: 1 }).toISO(), projectRoom, DEMO_DAILY_RULE_ID);

        await scheduler.tick();

        const failed = managerSnapshot();
        expect(failed.result).to.equal("failed");
        expect(failed.lastRunError, "the failure diagnostic stays discoverable").to.be.a("string");
        expect(Date.parse(failed.lastRunStartedAt!)).to.be.greaterThan(Date.parse(succeeded.lastRunStartedAt!));
        expect(failed.lastSuccessfulRunAt, "the earlier success is untouched").to.equal(firstSuccessAt);
    });

    // AS-004 / REQ-007 — a manual run is an execution, not a consumed occurrence.
    it("does not move the recurrence cursor for a Run now execution", async function() {
        const before = managerSnapshot();
        const cursorBefore = indexRow().next_run_at;

        const result = await scheduler.runRuleNow(projectRoom, DEMO_DAILY_RULE_ID);
        expect(result.success, result.error).to.equal(true);

        const after = managerSnapshot();
        expect(after.result).to.equal("success");
        expect(after.lastRunStartedAt).to.be.a("string");
        expect(after.lastSuccessfulRunAt).to.be.a("string");

        expect(indexRow().next_run_at, "the scheduler cursor is untouched").to.equal(cursorBefore);
        expect(after.next.nextRunAt).to.equal(before.next.nextRunAt);
    });

    // AS-005 — turning a Schedule off withdraws its next occurrence, turning it
    // back on restores the scheduler's own one rather than a local guess.
    it("withdraws and restores the next occurrence around an enable/disable", function() {
        const ruleMap = ruleMapOf(docs.get(projectRoom)!);
        const cursor = indexRow().next_run_at;

        ruleMap.set("enabled", false);
        // Before the scheduler has re-indexed, the manager already stops
        // presenting the occurrence as eligible.
        expect(managerSnapshot().next.state).to.equal("disabled");

        storeProjectDocument();
        expect(indexRow().state).to.equal("disabled");
        expect(managerSnapshot().next.state).to.equal("disabled");
        expect(ruleMap.get("schedulerNextRunAt"), "no future timestamp is left behind").to.be.undefined;

        ruleMap.set("enabled", true);
        // Enabled again but not yet reconciled: an explicit waiting state, not
        // a locally computed occurrence.
        expect(managerSnapshot().next.state).to.equal("pending");

        storeProjectDocument();
        const restored = managerSnapshot();
        expect(restored.next.state).to.equal("scheduled");
        expect(restored.next.nextRunAt).to.equal(indexRow().next_run_at);
        expect(restored.next.nextRunAt).to.equal(cursor);
    });

    // AS-008 / REQ-009 — a `running` marker that outlived its process.
    it("reconciles an execution the scheduler could not finish to a terminal state", async function() {
        // Capture the document exactly as persistence would have stored it
        // while an execution was in flight: the marker below is written by the
        // real scheduler, not assembled by the test.
        let interruptedState: Uint8Array | undefined;
        const liveRule = ruleMapOf(docs.get(projectRoom)!);
        liveRule.observe(() => {
            if (!interruptedState && liveRule.get("lastRunStatus") === "running") {
                interruptedState = Y.encodeStateAsUpdate(docs.get(projectRoom)!);
            }
        });
        await scheduler.tick();
        expect(interruptedState, "an in-flight execution was captured").to.not.be.undefined;
        await scheduler.stop();

        // A fresh process resumes from that stored state.
        const restarted = new Y.Doc();
        Y.applyUpdate(restarted, interruptedState!);
        const restartedRule = ruleMapOf(restarted);
        expect(restartedRule.get("lastRunStatus")).to.equal("running");
        const startedAt = restartedRule.get("lastRunStartedAt") as string;
        const successBefore = restartedRule.get("lastSuccessfulRunAt");

        docs = buildDocs(restarted);
        // Nothing is due, so the sweep is the only thing this tick performs.
        db.prepare(`UPDATE schedule_index SET next_run_at = ? WHERE room = ? AND rule_id = ?`)
            .run(DateTime.utc().plus({ days: 1 }).toISO(), projectRoom, DEMO_DAILY_RULE_ID);
        scheduler = buildScheduler();
        await scheduler.tick();

        const snapshot = managerSnapshot(restarted);
        expect(snapshot.result).to.equal("interrupted");
        expect(snapshot.lastRunStartedAt, "the start instant is preserved").to.equal(startedAt);
        expect(snapshot.lastRunError).to.be.a("string");
        expect(restartedRule.get("lastSuccessfulRunAt"), "no success is credited").to.equal(successBefore);
    });

    // AS-010 — a delayed observation of an older execution must not regress the
    // row to that execution, nor pair its result with the newer start time.
    it("drops a terminal result once a newer execution owns the telemetry", async function() {
        const ruleMap = ruleMapOf(docs.get(projectRoom)!);
        let superseded = false;
        let supersededStartedAt = "";
        ruleMap.observe(() => {
            if (superseded || ruleMap.get("lastRunStatus") !== "running") return;
            superseded = true;
            // Another scheduler process claims the telemetry for execution B
            // while execution A is still running — the same shared-document
            // writes a second process would make.
            supersededStartedAt = new Date(Date.now() + 1000).toISOString();
            ruleMap.set("lastRunSeq", ((ruleMap.get("lastRunSeq") as number) ?? 0) + 1);
            ruleMap.set("lastRunStartedAt", supersededStartedAt);
            ruleMap.set("lastRunStatus", "running");
        });

        // A manual run is exactly one execution attempt, so the telemetry
        // below is unambiguously execution A's.
        const result = await scheduler.runRuleNow(projectRoom, DEMO_DAILY_RULE_ID);
        expect(result.success, result.error).to.equal(true);

        const snapshot = managerSnapshot();
        expect(superseded, "execution A published a running state").to.equal(true);
        // Execution A's result never lands on execution B's row.
        expect(snapshot.lastRunStartedAt).to.equal(supersededStartedAt);
        expect(snapshot.result).to.equal("running");
        expect(snapshot.lastSuccessfulRunAt, "A's success is not credited to B").to.be.undefined;
    });

    // AS-007 — pre-#5290 telemetry.
    it("migrates a proven legacy success without inventing an execution start", function() {
        const legacyDoc = buildProjectDoc();
        const legacyRule = ruleMapOf(legacyDoc);
        legacyRule.set("lastRunAt", "2026-08-16T10:00:00.000Z");
        legacyRule.set("lastRunStatus", "ok");

        handleStoreDocumentForSchedules({ documentName: projectRoom, document: legacyDoc } as any, db);

        expect(legacyRule.get("lastRunStartedAt"), "no start time is invented").to.be.undefined;
        expect(legacyRule.get("lastSuccessfulRunAt")).to.equal("2026-08-16T10:00:00.000Z");

        const snapshot = managerSnapshot(legacyDoc);
        expect(snapshot.lastRunStartedAt).to.be.undefined;
        expect(snapshot.startTimeUnrecorded).to.equal(true);
        expect(snapshot.result).to.equal("success");
    });

    it("invents no successful completion for a legacy execution that failed", function() {
        const legacyDoc = buildProjectDoc();
        const legacyRule = ruleMapOf(legacyDoc);
        legacyRule.set("lastRunAt", "2026-08-16T10:00:00.000Z");
        legacyRule.set("lastRunStatus", "error");
        legacyRule.set("lastRunError", 'relation "gone" does not exist');

        handleStoreDocumentForSchedules({ documentName: projectRoom, document: legacyDoc } as any, db);

        expect(legacyRule.get("lastSuccessfulRunAt")).to.be.undefined;
        const snapshot = managerSnapshot(legacyDoc);
        expect(snapshot.result).to.equal("failed");
        expect(snapshot.lastRunStartedAt).to.be.undefined;
        expect(snapshot.lastSuccessfulRunAt).to.be.undefined;
        expect(snapshot.lastRunError).to.contain("does not exist");
    });

    // REQ-006 — a Schedule the indexer drops keeps its rule map but loses its
    // index row. The cursor it published while it was still schedulable has to
    // go with the row, or the manager advertises an occurrence forever.
    it("withdraws the published cursor when the scheduler drops the Schedule from its index", function() {
        const projectDoc = reseed({ dtstart: singleOccurrenceDtstart });
        const published = managerSnapshot(projectDoc);
        expect(published.next.state, "the Schedule starts out scheduled").to.equal("scheduled");
        expect(published.next.nextRunAt).to.be.a("string");

        // The user clears Start Time in the editor and saves. `dtstart` is the
        // only thing that changes; the rule stays in the document.
        ruleMapOf(projectDoc).set("dtstart", "");
        storeProjectDocument(projectDoc);

        expect(indexRow(), "the scheduler dropped its index row").to.be.undefined;
        const snapshot = managerSnapshot(projectDoc);
        expect(snapshot.next.state, "no occurrence is presented as eligible").to.not.equal("scheduled");
        expect(snapshot.next.nextRunAt, "the spent cursor is gone from the document").to.be.undefined;
    });

    // REQ-009 — a `Run now` execution of a rule the recurrence index does not
    // carry is still an execution that a restart has to reconcile.
    it("recovers an interrupted manual run of a Schedule with no index row", async function() {
        const projectDoc = reseed({ dtstart: singleOccurrenceDtstart });

        // A real successful manual run first, so the preserved success below
        // comes from the production path.
        const first = await scheduler.runRuleNow(projectRoom, DEMO_DAILY_RULE_ID);
        expect(first.success, first.error).to.equal(true);
        const successAt = managerSnapshot(projectDoc).lastSuccessfulRunAt;
        expect(successAt, "a real success was recorded").to.be.a("string");

        // The rule loses its recurrence, so the indexer drops it entirely. It
        // stays manually runnable: `Run now` needs only SQL and a target.
        ruleMapOf(projectDoc).set("dtstart", "");
        storeProjectDocument(projectDoc);
        expect(indexRow(), "the project has no indexed rule left").to.be.undefined;

        // A second manual run, captured while it is genuinely in flight: the
        // durable state a process leaves behind when it dies mid-execution is
        // its stored document plus its in-flight ledger row, and both are read
        // here out of the real thing rather than assembled. The target table is
        // opened by the execution itself, so this is mid-SQL — before any
        // result exists to be recorded.
        let diedWith: { document: Uint8Array; activeRuns: unknown[]; } | undefined;
        hocuspocus.openDirectConnection = async (room: string) => {
            if (room === tableRoom && !diedWith) {
                diedWith = {
                    document: persisted.get(projectDoc)!,
                    activeRuns: db.prepare(`SELECT * FROM schedule_active_runs`).all(),
                };
            }
            return { document: docs.get(room) ?? null, disconnect: function() {} };
        };
        await scheduler.runRuleNow(projectRoom, DEMO_DAILY_RULE_ID);
        await scheduler.stop();

        expect(diedWith, "an execution was captured in flight").to.not.be.undefined;
        expect(diedWith!.activeRuns, "with its in-flight record").to.have.length(1);
        expect(
            (diedWith!.activeRuns[0] as { status: string | null; }).status,
            "and no result recorded for it yet",
        ).to.equal(null);

        // Resume from exactly that durable state.
        const restarted = new Y.Doc();
        Y.applyUpdate(restarted, diedWith!.document);
        expect(
            ruleMapOf(restarted).get("lastRunStatus"),
            "the execution is persisted as running with no terminal result",
        ).to.equal("running");
        docs = buildDocs(restarted);
        db.prepare(`DELETE FROM schedule_active_runs`).run();
        for (const row of diedWith!.activeRuns as Record<string, unknown>[]) {
            db.prepare(`INSERT INTO schedule_active_runs (room, rule_id, run_seq) VALUES (?, ?, ?)`)
                .run(row.room, row.rule_id, row.run_seq);
        }

        // A fresh scheduler resumes over the same persisted state. Its only
        // route to this room is the in-flight record: the recurrence index
        // holds nothing for this project.
        scheduler = buildScheduler();
        await scheduler.tick();

        const snapshot = managerSnapshot(restarted);
        expect(snapshot.result, "the interrupted manual run is reconciled").to.equal("interrupted");
        expect(snapshot.lastSuccessfulRunAt, "no success is disturbed by recovery").to.equal(successAt);
    });

    // REQ-006 / REQ-008 — the manager rebuilds its rows on every shared-document
    // change, so *every* intermediate state it can render is asserted, not only
    // the state left behind once the tick has finished. A terminal result must
    // never still advertise the occurrence that execution consumed.
    describe("lifecycle generations never mix while a tick runs", function() {
        function assertNoTerminalResultKeepsConsumedCursor(
            rendered: ReturnType<typeof managerSnapshot>[],
            consumed: string,
        ) {
            const terminal = rendered.filter(snapshot => TERMINAL_RESULTS.includes(snapshot.result));
            expect(terminal.length, "a terminal result was rendered").to.be.greaterThan(0);
            for (const snapshot of terminal) {
                expect(
                    snapshot.next.nextRunAt,
                    `a ${snapshot.result} execution still advertised the occurrence it consumed`,
                ).to.not.equal(consumed);
            }
        }

        it("advances the cursor with the terminal result of a successful execution", async function() {
            const projectDoc = reseed({ dtstart: singleOccurrenceDtstart });
            const consumed = indexRow().next_run_at!;
            const rendered = recordRenderedSnapshots(projectDoc);

            await scheduler.tick();

            assertNoTerminalResultKeepsConsumedCursor(rendered, consumed);

            const settled = managerSnapshot(projectDoc);
            expect(settled.result).to.equal("success");
            expect(settled.next.state).to.equal("scheduled");
            expect(settled.next.nextRunAt).to.equal(indexRow().next_run_at);
            expect(settled.next.nextRunAt).to.not.equal(consumed);
        });

        it("advances the cursor with the terminal result of a failed execution", async function() {
            const projectDoc = reseed({ dtstart: singleOccurrenceDtstart });
            ruleMapOf(projectDoc).set(
                "sql",
                "INSERT INTO no_such_table (id) VALUES (gen_random_uuid()) RETURNING *;",
            );
            const consumed = indexRow().next_run_at!;
            const rendered = recordRenderedSnapshots(projectDoc);

            await scheduler.tick();

            assertNoTerminalResultKeepsConsumedCursor(rendered, consumed);
            expect(managerSnapshot(projectDoc).result).to.equal("failed");
        });

        it("completes the recurrence with the terminal result of its final execution", async function() {
            const projectDoc = reseed({
                dtstart: singleOccurrenceDtstart,
                rrule: "RRULE:FREQ=DAILY;COUNT=1",
            });
            const consumed = indexRow().next_run_at!;
            const rendered = recordRenderedSnapshots(projectDoc);

            await scheduler.tick();

            assertNoTerminalResultKeepsConsumedCursor(rendered, consumed);

            const settled = managerSnapshot(projectDoc);
            expect(settled.result).to.equal("success");
            // Exhausted: no eligible occurrence rather than the spent one.
            expect(settled.next.state).to.equal("completed");
            expect(settled.next.nextRunAt).to.be.undefined;
        });
    });

    // REQ-003 / REQ-004 / REQ-005 — an execution that cannot claim its start
    // telemetry would mutate its target while the manager still described the
    // previous attempt, and could not credit its own success.
    it("runs no SQL when the execution's start telemetry cannot be claimed", async function() {
        const projectDoc = reseed({ dtstart: singleOccurrenceDtstart });

        // Settle the interrupted-run sweep on a tick with nothing due, so the
        // connections counted below are only the ones the dispatch itself
        // makes: `processRule` reading the rule, then the start claim.
        const dueAt = indexRow().next_run_at;
        db.prepare(`UPDATE schedule_index SET next_run_at = ? WHERE room = ? AND rule_id = ?`)
            .run(DateTime.utc().plus({ days: 1 }).toISO(), projectRoom, DEMO_DAILY_RULE_ID);
        await scheduler.tick();
        db.prepare(`UPDATE schedule_index SET next_run_at = ? WHERE room = ? AND rule_id = ?`)
            .run(dueAt, projectRoom, DEMO_DAILY_RULE_ID);

        const before = managerSnapshot(projectDoc);
        const rowsBefore = docs.get(tableRoom)!.getMap("data").size;

        // The project document is unreachable for exactly the connection the
        // start claim needs. Every other room — the target table above all —
        // stays reachable, so nothing but the missing claim can stop the job.
        let projectOpens = 0;
        let tableOpens = 0;
        hocuspocus.openDirectConnection = async (room: string) => {
            if (room === projectRoom) {
                projectOpens += 1;
                if (projectOpens === 2) throw new Error("transient connection failure");
            }
            if (room === tableRoom) tableOpens += 1;
            return { document: docs.get(room) ?? null, disconnect: function() {} };
        };

        await scheduler.tick();

        expect(projectOpens, "the start claim was attempted").to.be.at.least(2);
        // The job never reached its target: an execution with no claimed
        // generation can publish neither its start nor its result.
        expect(tableOpens, "the target table was never opened").to.equal(0);
        expect(
            docs.get(tableRoom)!.getMap("data").size,
            "no rows were written by an execution with no claimed telemetry",
        ).to.equal(rowsBefore);

        const after = managerSnapshot(projectDoc);
        expect(after.result, "the manager still describes the previous attempt").to.equal(before.result);
        expect(after.lastRunStartedAt).to.equal(before.lastRunStartedAt);
        expect(after.lastSuccessfulRunAt).to.equal(before.lastSuccessfulRunAt);
        // Unconsumed, so the occurrence is retried rather than silently skipped.
        expect(indexRow().next_run_at).to.equal(dueAt);
    });

    // REQ-009 — recovery that fails transiently must not be abandoned for the
    // lifetime of the process.
    it("retries interrupted-run recovery after a transient failure", async function() {
        const projectDoc = reseed({ dtstart: singleOccurrenceDtstart });

        // A real successful execution first, so the preserved
        // `lastSuccessfulRunAt` below comes from the production path.
        await scheduler.tick();
        const successAt = managerSnapshot(projectDoc).lastSuccessfulRunAt;
        expect(successAt, "a real success was recorded").to.be.a("string");

        // Due again, then captured mid-flight exactly as persistence would have
        // stored it when the process died.
        db.prepare(`UPDATE schedule_index SET next_run_at = ?, state = 'active' WHERE room = ? AND rule_id = ?`)
            .run(DateTime.utc().minus({ minutes: 1 }).toISO(), projectRoom, DEMO_DAILY_RULE_ID);
        let interruptedState: Uint8Array | undefined;
        const liveRule = ruleMapOf(projectDoc);
        liveRule.observe(() => {
            if (!interruptedState && liveRule.get("lastRunStatus") === "running") {
                interruptedState = Y.encodeStateAsUpdate(projectDoc);
            }
        });
        await scheduler.tick();
        expect(interruptedState, "an in-flight execution was captured").to.not.be.undefined;
        await scheduler.stop();

        const restarted = new Y.Doc();
        Y.applyUpdate(restarted, interruptedState!);
        expect(ruleMapOf(restarted).get("lastRunStatus")).to.equal("running");
        expect(ruleMapOf(restarted).get("lastSuccessfulRunAt")).to.equal(successAt);

        docs = buildDocs(restarted);
        // Nothing is due, so the sweep is the only work these ticks perform.
        db.prepare(`UPDATE schedule_index SET next_run_at = ?, state = 'active' WHERE room = ? AND rule_id = ?`)
            .run(DateTime.utc().plus({ days: 1 }).toISO(), projectRoom, DEMO_DAILY_RULE_ID);
        scheduler = buildScheduler();

        let failNextProjectOpen = true;
        hocuspocus.openDirectConnection = async (room: string) => {
            if (room === projectRoom && failNextProjectOpen) {
                failNextProjectOpen = false;
                throw new Error("transient connection failure");
            }
            return { document: docs.get(room) ?? null, disconnect: function() {} };
        };

        await scheduler.tick();
        expect(failNextProjectOpen, "the first sweep attempt failed").to.equal(false);
        expect(
            ruleMapOf(restarted).get("lastRunStatus"),
            "the failed sweep left the marker untouched",
        ).to.equal("running");

        // The next tick retries the room that could not be swept.
        await scheduler.tick();

        const snapshot = managerSnapshot(restarted);
        expect(snapshot.result, "recovery is not abandoned after a transient failure").to.equal("interrupted");
        expect(snapshot.lastSuccessfulRunAt, "no success is disturbed by recovery").to.equal(successAt);
    });

    // REQ-006/REQ-008 — the cursor a tick is carrying describes the recurrence
    // as it was when the tick began. A Schedule whose recurrence is removed
    // while it executes must not have that cursor republished over the
    // withdrawal the indexer just made.
    it("withholds a consumed cursor when the recurrence is removed mid-execution", async function() {
        const projectDoc = reseed({ dtstart: singleOccurrenceDtstart });
        const rendered = recordRenderedSnapshots(projectDoc);
        expect(managerSnapshot(projectDoc).next.state, "the occurrence starts out scheduled").to.equal("scheduled");

        // The editor save lands while the job is in flight: the target table is
        // opened by the execution itself, so this is genuinely mid-execution
        // rather than before or after the dispatch.
        let withdrawnAt: number | undefined;
        hocuspocus.openDirectConnection = async (room: string) => {
            if (room === tableRoom && withdrawnAt === undefined) {
                clearRecurrence(projectDoc);
                withdrawnAt = rendered.length;
            }
            return { document: docs.get(room) ?? null, disconnect: function() {} };
        };

        await scheduler.tick();

        expect(withdrawnAt, "the recurrence was removed while the job was running").to.not.be.undefined;
        expect(indexRow(), "the indexer dropped the rule").to.be.undefined;

        const final = managerSnapshot(projectDoc);
        expect(final.result, "the execution still published its own result").to.be.oneOf(TERMINAL_RESULTS);
        expect(final.next.state, "no occurrence is presented as eligible").to.not.equal("scheduled");
        expect(final.raw.schedulerNextRunAt, "no timestamp survives the withdrawal").to.be.undefined;

        // Every state the manager could render after the withdrawal, not just
        // the one it settles on.
        for (const snapshot of rendered.slice(withdrawnAt!)) {
            expect(snapshot.next.state, "a withdrawn cursor is never republished").to.not.equal("scheduled");
            expect(snapshot.raw.schedulerNextRunAt, "a withdrawn timestamp is never republished").to.be.undefined;
        }
    });

    // REQ-004/REQ-005/REQ-007 — a result the execution actually produced must
    // not be lost because publishing it failed. The same process must finish
    // the job, without re-running its SQL.
    it("republishes a completed result whose publication failed, in the same process", async function() {
        const projectDoc = reseed({ dtstart: singleOccurrenceDtstart });

        // A real success first, then the rule loses its recurrence: from here
        // it is manually executable but carries no index row, so nothing but
        // its own in-flight record can lead recovery back to it.
        await scheduler.runRuleNow(projectRoom, DEMO_DAILY_RULE_ID);
        const successAt = managerSnapshot(projectDoc).lastSuccessfulRunAt;
        expect(successAt, "a real success was recorded").to.be.a("string");
        clearRecurrence(projectDoc);
        expect(indexRow(), "the rule is no longer indexed").to.be.undefined;

        // Startup reconciliation retires here, so nothing is left watching for
        // unfinished work unless the failure below re-arms it.
        await scheduler.tick();
        expect(owedRunRow(), "no execution is outstanding").to.be.undefined;

        // Fail exactly the terminal publication: by the time the outcome is
        // recorded, the only project connection still to come is the one that
        // publishes it.
        let deniedPublication = 0;
        let executions = 0;
        hocuspocus.openDirectConnection = async (room: string) => {
            if (room === projectRoom && owedRunRow()?.status && deniedPublication === 0) {
                deniedPublication += 1;
                throw new Error("transient connection failure");
            }
            // The target table is opened once per execution of the rule's SQL.
            if (room === tableRoom) executions += 1;
            return { document: docs.get(room) ?? null, disconnect: function() {} };
        };

        const result = await scheduler.runRuleNow(projectRoom, DEMO_DAILY_RULE_ID);
        expect(result.success, "the execution itself succeeded").to.equal(true);
        expect(deniedPublication, "its terminal publication was denied").to.equal(1);
        expect(executions, "the SQL ran once").to.equal(1);

        const owed = owedRunRow();
        expect(owed?.status, "the outcome survives in the scheduler's own record").to.equal("ok");
        expect(
            managerSnapshot(projectDoc).result,
            "the manager has not been told yet",
        ).to.equal("running");

        // The same process, still running, finishes the job it started.
        await scheduler.tick();

        const snapshot = managerSnapshot(projectDoc);
        expect(snapshot.result, "the completed result reaches the manager").to.equal("success");
        expect(
            snapshot.raw.lastRunAt,
            "it carries the instant the execution finished, not the instant it was rescued",
        ).to.equal(owed?.completed_at);
        expect(snapshot.lastSuccessfulRunAt).to.equal(owed?.completed_at);
        expect(snapshot.lastSuccessfulRunAt, "and supersedes the earlier success").to.not.equal(successAt);
        expect(executions, "recovery published the result rather than re-running the SQL").to.equal(1);
        expect(owedRunRow(), "the record is spent once the result is published").to.be.undefined;
    });

    // REQ-009 — the record proving an execution is still owed must outlive the
    // in-memory write that settles it. Hocuspocus stores a document on a
    // debounce, so a process that dies in that window must still be recoverable.
    it("keeps its recovery record until the terminal result is durably stored", async function() {
        const projectDoc = reseed({ dtstart: singleOccurrenceDtstart });
        await scheduler.runRuleNow(projectRoom, DEMO_DAILY_RULE_ID);
        const successAt = managerSnapshot(projectDoc).lastSuccessfulRunAt;
        clearRecurrence(projectDoc);
        await scheduler.tick();
        expect(indexRow(), "the rule is no longer indexed").to.be.undefined;

        // The process dies inside the debounce window of the *terminal* write:
        // it reaches memory, its store never completes. The execution's start
        // is stored normally, so this is a crash at completion rather than a
        // Schedule that could not begin.
        hocuspocus.storeDocumentHooks = async (document: Y.Doc) => {
            if (document === projectDoc && owedRunRow()?.status) {
                throw new Error("process terminated before the store completed");
            }
            persisted.set(document, Y.encodeStateAsUpdate(document));
        };

        const result = await scheduler.runRuleNow(projectRoom, DEMO_DAILY_RULE_ID);
        expect(result.success, "the execution itself succeeded").to.equal(true);

        const owed = owedRunRow();
        expect(owed?.status, "the recovery record survives the unstored write").to.equal("ok");

        // Restart from what actually reached storage — which still says running.
        await scheduler.stop();
        const restarted = reloadFromStorage(projectDoc);
        expect(ruleMapOf(restarted).get("lastRunStatus"), "storage still says running").to.equal("running");
        expect(ruleMapOf(restarted).get("lastRunSeq")).to.equal(owed?.run_seq);

        docs = buildDocs(restarted);
        scheduler = buildScheduler();
        await scheduler.tick();

        const snapshot = managerSnapshot(restarted);
        expect(snapshot.result, "the restarted process recovers the completed run").to.equal("success");
        expect(snapshot.raw.lastRunAt, "with the completion time it actually reached").to.equal(owed?.completed_at);
        expect(snapshot.lastSuccessfulRunAt).to.equal(owed?.completed_at);
        expect(snapshot.lastSuccessfulRunAt, "superseding the earlier success").to.not.equal(successAt);
        expect(owedRunRow(), "the record is spent once recovery is durable").to.be.undefined;
    });
});
