import { Project } from "$shared/app-schema";
import { readSqlCatalog, type SqlCatalogSnapshot } from "$shared/services/sqlCatalog";
import {
    compileSqlEnvironment,
    type SqlDependencyEvidence,
    type SqlEnvironmentInput,
    type SqlInspectionTarget,
    type SqlTableSnapshot,
} from "$shared/services/sqlEnvironmentCompiler";
import * as Y from "yjs";
import { getCalendar, listCalendars } from "../calendar/calendarService";
import { getGridHandles, listGrids } from "./gridDocs";
import { getTableHandles, listTables } from "./tableDocs";

export class StructuralEnumCompatibilityError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "StructuralEnumCompatibilityError";
    }
}

export interface StructuralSqlSnapshot {
    catalog: SqlCatalogSnapshot;
    tables: readonly SqlTableSnapshot[];
    inspections: readonly SqlInspectionTarget[];
}

function declaredEnumNames(snapshot: StructuralSqlSnapshot): string[] {
    return snapshot.catalog.objects.flatMap(object => {
        const match = /^\s*CREATE\s+TYPE\s+(?:"((?:[^"]|"")+)"|([A-Za-z_][A-Za-z0-9_$]*))\s+AS\s+ENUM\b/i
            .exec(object.source);
        return match ? [(match[1]?.replaceAll('""', '"') ?? match[2]).toLowerCase()] : [];
    });
}

function relevantSql(snapshot: StructuralSqlSnapshot, relevantIds: ReadonlySet<string>): string[] {
    return [
        ...snapshot.tables.filter(table => relevantIds.has(table.id)).map(table => table.schema),
        ...snapshot.inspections.filter(item => relevantIds.has(item.id)).map(item => item.sql),
    ];
}

/** Fast negative proof: unrelated catalog entries cannot affect plain SQL. */
function referencesCapturedEnum(snapshot: StructuralSqlSnapshot, relevantIds: ReadonlySet<string>): boolean {
    const sql = relevantSql(snapshot, relevantIds).join("\n").toLowerCase();
    return declaredEnumNames(snapshot).some(name =>
        new RegExp(`(^|[^a-z0-9_$])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9_$]|$)`).test(sql)
    );
}

function records(doc: Y.Doc, tableId: string): SqlTableSnapshot["records"] {
    const handles = getTableHandles(doc, tableId);
    if (!handles) throw new StructuralEnumCompatibilityError(`Table "${tableId}" dependency evidence is unavailable.`);
    return [...handles.data].map(([id, value]) => ({ id, values: Object.fromEntries(value) }));
}

/** Capture immutable compiler input before any asynchronous transfer planning. */
export function captureStructuralSqlSnapshot(doc: Y.Doc): StructuralSqlSnapshot {
    const catalog = readSqlCatalog(doc.guid, doc);
    if (catalog.status !== "ready") {
        throw new StructuralEnumCompatibilityError("SQL catalog dependency evidence is unavailable.");
    }
    const tables = listTables(doc).map(entry => {
        const handles = getTableHandles(doc, entry.tableId);
        if (!handles) {
            throw new StructuralEnumCompatibilityError(`Table "${entry.name}" dependency evidence is unavailable.`);
        }
        return { id: entry.tableId, schema: handles.schemaText.toString(), records: records(doc, entry.tableId) };
    });
    const inspections: SqlInspectionTarget[] = listGrids(doc).flatMap(grid => {
        const sql = String(getGridHandles(doc, grid.gridId)?.entry.get("query") ?? "");
        return sql.trim() ? [{ id: grid.gridId, kind: "grid" as const, sql }] : [];
    });
    const project = Project.fromDoc(doc);
    for (const calendar of listCalendars(project)) {
        const settings = getCalendar(project, calendar.id);
        if (settings?.query.trim()) inspections.push({ id: calendar.id, kind: "calendar", sql: settings.query });
    }
    const schedules = doc.share.get("schedules");
    if (schedules instanceof Y.Map) {
        schedules.forEach((value, id) => {
            const sql = value instanceof Y.Map ? String(value.get("sql") ?? "") : "";
            if (sql.trim()) inspections.push({ id, kind: "schedule", sql });
        });
    }
    return Object.freeze({
        catalog: catalog.snapshot,
        tables: Object.freeze(tables),
        inspections: Object.freeze(inspections),
    });
}

function evidenceFor(
    dependencies: readonly SqlDependencyEvidence[],
    ids: ReadonlySet<string>,
): SqlDependencyEvidence[] {
    return dependencies.filter(item => ids.has(item.referencingId));
}

/** Validate exact ordered ENUM meaning, then prove the live snapshots still match the plan. */
export async function assertStructuralEnumCompatibility(
    sourceDoc: Y.Doc,
    destinationDoc: Y.Doc,
    source: StructuralSqlSnapshot,
    relevantIds: ReadonlySet<string>,
): Promise<void> {
    // Catalog-independent transfers must not become coupled to unrelated
    // catalog/runtime work (REQ-006). With no source declarations there is no
    // portable custom type whose meaning can be lost.
    if (source.catalog.objects.length === 0 || !referencesCapturedEnum(source, relevantIds)) return;
    const destination = captureStructuralSqlSnapshot(destinationDoc);
    const sourceResult = await compileSqlEnvironment(source as SqlEnvironmentInput);
    if (sourceResult.status !== "ready") {
        throw new StructuralEnumCompatibilityError("Structural transfer dependency evidence is unresolved or invalid.");
    }
    const relevant = evidenceFor(sourceResult.environment.dependencies, relevantIds);
    const incomplete = relevant.find(item => item.status !== "complete");
    if (incomplete) {
        await sourceResult.environment.dispose();
        throw new StructuralEnumCompatibilityError(
            incomplete.diagnostic ?? "Structural transfer dependency evidence is incomplete.",
        );
    }
    const requiredIds = new Set(relevant.flatMap(item => item.requiredEnums.map(required => required.objectId)));
    const required = sourceResult.environment.enums.filter(item => requiredIds.has(item.objectId));
    if (sourceDoc === destinationDoc) {
        await sourceResult.environment.dispose();
    } else {
        const destinationResult = await compileSqlEnvironment(destination as SqlEnvironmentInput);
        try {
            if (destinationResult.status !== "ready") {
                throw new StructuralEnumCompatibilityError(
                    "Destination SQL catalog dependency evidence is unavailable.",
                );
            }
            for (const expected of required) {
                const actual = destinationResult.environment.enums.find(item => item.name === expected.name);
                if (
                    !actual || actual.labels.length !== expected.labels.length
                    || actual.labels.some((label, index) => label !== expected.labels[index])
                ) {
                    throw new StructuralEnumCompatibilityError(
                        `Required ENUM type "${expected.name}" is missing or incompatible in the destination Project.`,
                    );
                }
            }
        } finally {
            if (destinationResult.status === "ready") await destinationResult.environment.dispose();
            await sourceResult.environment.dispose();
        }
    }
    const latestSource = captureStructuralSqlSnapshot(sourceDoc);
    const latestDestination = captureStructuralSqlSnapshot(destinationDoc);
    if (
        latestSource.catalog.revision !== source.catalog.revision
        || latestDestination.catalog.revision !== destination.catalog.revision
        || JSON.stringify(latestSource.tables) !== JSON.stringify(source.tables)
        || JSON.stringify(latestSource.inspections) !== JSON.stringify(source.inspections)
    ) {
        throw new StructuralEnumCompatibilityError(
            "SQL dependency evidence changed while the structural transfer was being planned.",
        );
    }
}

/** Guard a portable clipboard plan using the catalog captured at Copy time. */
export async function assertPortableStructuralEnumCompatibility(
    destinationDoc: Y.Doc,
    source: StructuralSqlSnapshot,
    relevantIds: ReadonlySet<string>,
): Promise<void> {
    if (source.catalog.objects.length === 0 || !referencesCapturedEnum(source, relevantIds)) return;
    const destination = captureStructuralSqlSnapshot(destinationDoc);
    const sourceResult = await compileSqlEnvironment(source as SqlEnvironmentInput);
    if (sourceResult.status !== "ready") {
        throw new StructuralEnumCompatibilityError("Structural transfer dependency evidence is unresolved or invalid.");
    }
    const destinationResult = await compileSqlEnvironment(destination as SqlEnvironmentInput);
    try {
        if (destinationResult.status !== "ready") {
            throw new StructuralEnumCompatibilityError("Destination SQL catalog dependency evidence is unavailable.");
        }
        const relevant = evidenceFor(sourceResult.environment.dependencies, relevantIds);
        if (relevant.some(item => item.status !== "complete")) {
            throw new StructuralEnumCompatibilityError("Structural transfer dependency evidence is incomplete.");
        }
        const ids = new Set(relevant.flatMap(item => item.requiredEnums.map(required => required.objectId)));
        for (const expected of sourceResult.environment.enums.filter(item => ids.has(item.objectId))) {
            const actual = destinationResult.environment.enums.find(item => item.name === expected.name);
            if (
                !actual || actual.labels.length !== expected.labels.length
                || actual.labels.some((label, index) => label !== expected.labels[index])
            ) {
                throw new StructuralEnumCompatibilityError(
                    `Required ENUM type "${expected.name}" is missing or incompatible in the destination Project.`,
                );
            }
        }
    } finally {
        await sourceResult.environment.dispose();
        if (destinationResult.status === "ready") await destinationResult.environment.dispose();
    }
}
