import fs from "fs-extra";
import * as Y from "yjs";
import { OutlinerRelationService } from "../../src/mcp/relation-service.js";
import { OutlinerScheduleService } from "../../src/mcp/schedule-service.js";
import { createDocumentStore } from "../../src/persistence.js";
import { JobScheduler } from "../../src/scheduler/Scheduler.js";
import { SqlCatalogMutationService } from "../../src/sql-catalog-service.js";
import {
    AclStore,
    seedProject,
    startTestServer,
    stopTestServer,
    tempDir,
    type TestServer,
    withRoom,
} from "../server-create-table-fixture.js";

export const UID = "schedule-catalog-owner";
export const TYPE_NAME = "int_bool_num_state";

export interface CatalogScheduleFixture {
    dir: string;
    server: TestServer;
    acl: AclStore;
    scheduler: JobScheduler;
    relations: OutlinerRelationService;
    schedules: OutlinerScheduleService;
}

export async function fixture(): Promise<CatalogScheduleFixture> {
    const dir = tempDir();
    const acl = new AclStore();
    const server = await startTestServer(dir, acl);
    const scheduler = new JobScheduler(server.hocuspocus);
    scheduler.start(3_600_000, false);
    const relations = new OutlinerRelationService(server.hocuspocus, acl.checkAccess);
    return {
        dir,
        server,
        acl,
        scheduler,
        relations,
        schedules: new OutlinerScheduleService(server.hocuspocus, acl.checkAccess, relations),
    };
}

export async function closeFixture(value: CatalogScheduleFixture) {
    await value.scheduler.stop();
    await stopTestServer(value.server);
    await fs.remove(value.dir);
}

export async function seedCatalogSchedule(
    value: CatalogScheduleFixture,
    projectId: string,
    labels = "'first', '', 'second'",
) {
    value.acl.grant("projectUsers", projectId, UID);
    await seedProject(value.server.hocuspocus, projectId);
    const catalog = catalogService(value, projectId);
    const before = await catalog.read(UID, projectId);
    const applied = await catalog.apply(UID, projectId, {
        expectedRevision: before.revision,
        intent: {
            operation: "create",
            object: {
                id: "enum-state",
                kind: "enum",
                source: `CREATE TYPE ${TYPE_NAME} AS ENUM (${labels})`,
            },
        },
    });
    if (applied.status !== "applied") throw new Error(`catalog setup failed: ${applied.status}`);

    await withRoom(value.server.hocuspocus, `projects/${projectId}`, doc => {
        const table = new Y.Map<unknown>();
        table.set("name", "Typed output");
        table.set("sqlName", "typed_output");
        table.set("doc", new Y.Doc());
        doc.getMap("yjsTables").set("typed-table", table);
        const rule = new Y.Map<unknown>();
        rule.set("name", "Typed schedule");
        rule.set("targetTableId", "typed-table");
        rule.set("timezone", "UTC");
        rule.set("rrule", "FREQ=DAILY;COUNT=2");
        rule.set("dtstart", "2026-10-11T00:00:00");
        rule.set("enabled", false);
        rule.set(
            "sql",
            `INSERT INTO typed_output (id, state) VALUES
            ('label', 'second'), ('empty', ''), ('nil', NULL) RETURNING *`,
        );
        doc.getMap("schedules").set("typed-rule", rule);
    });
    await withRoom(value.server.hocuspocus, `projects/${projectId}/tables/typed-table`, doc => {
        doc.getText("schema").insert(
            0,
            `CREATE TABLE typed_output (id TEXT PRIMARY KEY, state ${TYPE_NAME})`,
        );
    });
    return catalog;
}

export function catalogService(value: CatalogScheduleFixture, _projectId?: string) {
    return new SqlCatalogMutationService(
        value.server.hocuspocus,
        value.acl.checkAccess,
        createDocumentStore(value.server.persistence!),
    );
}

export async function records(value: CatalogScheduleFixture, projectId: string) {
    return await withRoom<Record<string, Record<string, unknown>>>(
        value.server.hocuspocus,
        `projects/${projectId}/tables/typed-table`,
        doc => Object.fromEntries([...doc.getMap<Y.Map<unknown>>("data")].map(([id, row]) => [id, row.toJSON()])),
    );
}

export async function storedRule(value: CatalogScheduleFixture, projectId: string) {
    return await withRoom(
        value.server.hocuspocus,
        `projects/${projectId}`,
        doc => (doc.getMap<Y.Map<unknown>>("schedules").get("typed-rule")?.toJSON() ?? {}) as Record<string, unknown>,
    );
}

export async function configureTarget(
    value: CatalogScheduleFixture,
    projectId: string,
    schema: string,
    sql: string,
    source: Record<string, unknown> = {},
) {
    await withRoom(value.server.hocuspocus, `projects/${projectId}`, doc => {
        const rule = doc.getMap<Y.Map<unknown>>("schedules").get("typed-rule");
        if (!rule) throw new Error("typed Schedule was not persisted");
        rule.set("sql", sql);
    });
    await withRoom(value.server.hocuspocus, `projects/${projectId}/tables/typed-table`, doc => {
        const text = doc.getText("schema");
        text.delete(0, text.length);
        if (schema) text.insert(0, schema);
        const data = doc.getMap("data");
        data.clear();
        if (Object.keys(source).length > 0) {
            const record = new Y.Map<unknown>();
            for (const [key, child] of Object.entries(source)) record.set(key, child);
            data.set(String(source.id), record);
        }
    });
}
