import { analyzeProjectQueryProvenance } from "$shared/services/projectQueryProvenance";
import { createProjectSelectSession } from "../../services/yjstable/projectSelectSession";
// Loaded only by the catalog Playwright spec through a Vite module script.
// All operations use the application's existing writers, real DB and cache.
import { goto } from "$app/navigation";
import { readSqlCatalog } from "$shared/services/sqlCatalog";
import { PGlite } from "@electric-sql/pglite";
import { userManager } from "../../auth/UserManager";
import { getRoomSyncState } from "../../lib/yjs/roomSyncState";
import { createCalendar } from "../../services/calendar/calendarService";
import { createScheduleRule } from "../../services/schedule/scheduleRuleService";
import { CatalogRuntime } from "../../services/yjstable/catalogRuntime";
import {
    createGrid,
    getGridHandles,
    getGridQuery,
    setGridComponentField,
    setGridQuery,
} from "../../services/yjstable/gridDocs";
import { appendGridPlacement } from "../../services/yjstable/gridPlacement";
import { runSelect } from "../../services/yjstable/pgliteService";
import { projectSchemaName, quoteIdent } from "../../services/yjstable/sqlNames";
import { getTableHandles, listTables } from "../../services/yjstable/tableDocs";
import {
    runWarmEvictionForTests,
    setTableEngineClockForTests,
    WARM_RETENTION_MS,
} from "../../services/yjstable/tableEngine";
import { TableSyncAdapter } from "../../services/yjstable/tableSyncAdapter";
import { store } from "../../stores/store.svelte";
import { yjsStore } from "../../stores/yjsStore.svelte";

let paused;
let release;
let candidateDbs = new WeakSet();
const publications = [];
const originalExec = PGlite.prototype.exec;
PGlite.prototype.exec = async function(sql, ...options) {
    const selected = paused && !paused.reached && String(sql).includes(paused.marker) ? paused : undefined;
    if (selected) {
        candidateDbs.add(this);
        selected.reached = true;
        await new Promise(resolve => release = resolve);
        selected.released = true;
    }
    // This is a delay, never a substituted database/result/type fixture.
    const result = await originalExec.call(this, sql, ...options);
    if (selected) selected.completed = true;
    return result;
};
const originalClose = PGlite.prototype.close;
PGlite.prototype.close = async function(...args) {
    const selected = candidateDbs.has(this) ? paused : undefined;
    if (selected) selected.closeStarted = true;
    const result = await originalClose.apply(this, args);
    if (selected) selected.closeCompleted = true;
    return result;
};
const originalPublish = CatalogRuntime.prototype.publish;
CatalogRuntime.prototype.publish = function(state) {
    publications.push({
        status: state.status,
        revision: state.snapshot?.revision,
        sources: state.snapshot?.objects.map(object => object.source),
    });
    return originalPublish.call(this, state);
};
const originalRebuild = CatalogRuntime.prototype.rebuild;
CatalogRuntime.prototype.rebuild = function(...args) {
    const catalog = readSqlCatalog(this.projectId, this.catalogDoc());
    const selected = paused && catalog.status === "ready"
            && catalog.snapshot.objects.some(object => object.source.includes(paused.marker))
        ? paused
        : undefined;
    if (selected) selected.buildsStarted++;
    const result = originalRebuild.apply(this, args);
    if (selected) {
        // Observe the original promises without replacing them. Count every
        // actual A build, so an unrelated B completion cannot satisfy this
        // barrier even if multiple A candidates were scheduled concurrently.
        void result.then(
            () => selected.buildsCompleted++,
            error => {
                selected.buildsCompleted++;
                selected.buildFailures.push(String(error));
            },
        );
    }
    return result;
};
function project() {
    if (!store.project) throw new Error("A normal Project route must load first");
    return store.project;
}
function projectId() {
    const id = yjsStore.yjsClient?.containerId;
    if (!id) throw new Error("The route has no connected Project identity");
    return id;
}
let extraPlacement;
let cellCommit;
let continueCellCommit;
const originalCommit = TableSyncAdapter.prototype.commitRecordValue;
TableSyncAdapter.prototype.commitRecordValue = function(...args) {
    if (cellCommit && !cellCommit.reached) {
        cellCommit.reached = true;
        cellCommit.recordId = args[0];
        cellCommit.column = args[1];
        continueCellCommit = () => originalCommit.apply(this, args);
        return;
    }
    return originalCommit.apply(this, args);
};

const controls = {
    goto,
    identity() {
        return { projectId: projectId(), uid: userManager.auth.currentUser?.uid };
    },
    source() {
        return readSqlCatalog(projectId(), project().ydoc);
    },
    tables() {
        return listTables(project().ydoc);
    },
    async holdViewProof(query) {
        this.releaseViewProof();
        const session = createProjectSelectSession({ projectDoc: project().ydoc, projectId: projectId(), query });
        const evidence = await new Promise((resolve, reject) => {
            let stop = () => {};
            const timer = setTimeout(() => {
                stop();
                reject(new Error("No current proof"));
            }, 20000);
            stop = session.subscribe(state => {
                if (state.status === "success") {
                    clearTimeout(timer);
                    stop();
                    resolve(state.evidence);
                }
            });
        });
        this.heldViewProof = { session, evidence };
        return { sources: evidence.sources, status: analyzeProjectQueryProvenance(evidence).status };
    },
    viewProofCurrent() {
        const held = this.heldViewProof;
        return held && held.session.isEvidenceCurrent(held.evidence);
    },
    releaseViewProof() {
        void this.heldViewProof?.session.dispose();
        this.heldViewProof = undefined;
    },
    snapshot(tableId) {
        const handles = getTableHandles(project().ydoc, tableId);
        if (!handles) throw new Error("Table not loaded");
        return {
            schema: handles.schemaText.toString(),
            records: Object.fromEntries(
                [...handles.data].sort(([a], [b]) => a.localeCompare(b)).map(([id, value]) => [id, value.toJSON()]),
            ),
        };
    },
    sync(tableId) {
        const base = `projects/${projectId()}`;
        return { project: getRoomSyncState(base), table: getRoomSyncState(`${base}/tables/${tableId}`) };
    },
    async queryCurrentOrder() {
        // A plain real SQL read cannot reacquire a Table, rebuild a runtime, or
        // repair relations removed by an incorrectly owned stale cleanup.
        const relation = `${quoteIdent(projectSchemaName(projectId()))}.${quoteIdent("catalog_tasks")}`;
        const result = await runSelect(`SELECT state FROM ${relation} ORDER BY state NULLS LAST`);
        return result.rows.map(row => row.state);
    },
    createViews() {
        const doc = project().ydoc;
        const gridId = createGrid(doc, undefined, {
            name: "Catalog order",
            query: "SELECT id, state FROM catalog_tasks ORDER BY state NULLS LAST",
            components: { state: { type: "select" } },
        });
        const calendarId = createCalendar(project(), {
            name: "Catalog calendar",
            query:
                "SELECT id AS id, state::TEXT AS title, CURRENT_DATE + INTERVAL '12 hours' AS start_at, false AS all_day, state::TEXT::priority_level AS typed_state FROM catalog_tasks WHERE state IS NOT NULL",
            roleTitle: "title",
            roleStart: "start_at",
            roleAllDay: "all_day",
            viewType: "week",
        });
        return { gridId, calendarId };
    },
    createTypedSchedule(tableId) {
        return createScheduleRule(project(), {
            ruleId: "catalog-e2e-schedule",
            name: "Catalog typed schedule",
            targetTableId: tableId,
            timezone: "UTC",
            rrule: "FREQ=DAILY;COUNT=1",
            dtstart: "2026-10-13T00:00:00",
            enabled: false,
            sql: "INSERT INTO catalog_tasks (id,title,done,state) VALUES ('scheduled','Scheduled',false,'medium') RETURNING *",
        });
    },
    addSecondView(embeddedGridId) {
        if (!store.currentPage) throw new Error("Open the ordinary Project page first");
        const handles = getGridHandles(project().ydoc, embeddedGridId);
        if (!handles) throw new Error("The UI-created embedded Grid is missing");
        setGridQuery(handles, "SELECT id, state FROM catalog_tasks ORDER BY state NULLS LAST");
        setGridComponentField(handles, "state", "type", "select");
        const secondGrid = createGrid(project().ydoc, undefined, {
            query: getGridQuery(handles),
            components: { state: { type: "select" } },
        });
        extraPlacement = appendGridPlacement(
            project().ydoc,
            store.currentPage.id,
            secondGrid,
            userManager.auth.currentUser.uid,
        );
        return secondGrid;
    },
    closeSecondView() {
        if (!extraPlacement) throw new Error("Second view was not opened");
        extraPlacement.delete();
        extraPlacement = undefined;
    },
    async evict() {
        setTableEngineClockForTests(() => Date.now() + WARM_RETENTION_MS + 1);
        try {
            await runWarmEvictionForTests();
        } finally {
            setTableEngineClockForTests(() => Date.now());
        }
        const relation = `${quoteIdent(projectSchemaName(projectId()))}.${quoteIdent("catalog_tasks")}`;
        try {
            await runSelect(`SELECT id FROM ${relation}`);
            return { dropped: false };
        } catch (error) {
            if (!/does not exist/i.test(String(error))) throw error;
            return { dropped: true };
        }
    },
    pauseBuild(marker) {
        if (paused && !paused.completed) throw new Error("An older build barrier is still active");
        candidateDbs = new WeakSet();
        paused = {
            marker,
            reached: false,
            released: false,
            completed: false,
            closeStarted: false,
            closeCompleted: false,
            buildsStarted: 0,
            buildsCompleted: 0,
            buildFailures: [],
        };
        publications.length = 0;
    },
    barrier() {
        return {
            ...paused,
            allBuildsCompleted: paused?.buildsStarted > 0 && paused.buildsCompleted === paused.buildsStarted,
            publications: [...publications],
        };
    },
    releaseBuild() {
        if (!paused?.reached || !release) throw new Error("No actual compiler execution reached the barrier");
        release();
    },
    pauseCellCommit() {
        cellCommit = { reached: false };
    },
    cellCommitBarrier() {
        return { ...cellCommit };
    },
    releaseCellCommit() {
        if (!cellCommit?.reached || !continueCellCommit) {
            throw new Error("A real cell handler did not reach the field-write boundary");
        }
        try {
            continueCellCommit();
            return { refused: false };
        } catch (error) {
            return { refused: true, message: String(error) };
        } finally {
            cellCommit = undefined;
            continueCellCommit = undefined;
        }
    },
};
globalThis.__catalogBrowserTest = controls;
