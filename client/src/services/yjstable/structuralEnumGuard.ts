import { Project } from "$shared/app-schema";
import { readSqlCatalog, type SqlCatalogSnapshot } from "$shared/services/sqlCatalog";
import {
    analyzeScopedSqlEnumDependencies,
    parseEnum,
    type SqlEnumMetadata,
    type SqlEnvironmentDescriptor,
    type SqlEnvironmentInput,
    type SqlInspectionTarget,
    type SqlTableSnapshot,
} from "$shared/services/sqlEnvironmentCompiler";
import * as Y from "yjs";
import { getCalendar, listCalendars } from "../calendar/calendarService";
import { getGridHandles, listGrids } from "./gridDocs";
import { ITEMS_RELATION_CREATE_SQL } from "./itemsRelation";
import { getTableHandles, listTables } from "./tableDocs";

const ITEMS_RELATION_ANALYSIS_ID = "__yjstable_outline_items_analysis__";

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

function enumDeclaration(source: string): { name: string; labels: string[]; } | undefined {
    try {
        return parseEnum(source);
    } catch {
        return undefined;
    }
}

interface CatalogEnumDeclaration {
    objectId: string;
    name: string;
    labels: string[];
}

/** A duplicated SQL name cannot provide an unambiguous required type. */
function uniqueEnumDeclarations(catalog: SqlCatalogSnapshot): Map<string, CatalogEnumDeclaration | undefined> {
    const declarations = new Map<string, CatalogEnumDeclaration | undefined>();
    for (const object of catalog.objects) {
        const declaration = enumDeclaration(object.source);
        if (!declaration) continue;
        declarations.set(
            declaration.name,
            declarations.has(declaration.name) ? undefined : { objectId: object.id, ...declaration },
        );
    }
    return declarations;
}

function matchesEnum(declaration: CatalogEnumDeclaration | undefined, expected: SqlEnumMetadata): boolean {
    return declaration?.name === expected.name
        && declaration.labels.length === expected.labels.length
        && declaration.labels.every((label, index) => label === expected.labels[index]);
}

function assertRequiredEnums(catalog: SqlCatalogSnapshot, required: readonly SqlEnumMetadata[]): void {
    const actual = uniqueEnumDeclarations(catalog);
    for (const expected of required) {
        if (matchesEnum(actual.get(expected.name), expected)) continue;
        const reason = actual.has(expected.name) && actual.get(expected.name) === undefined
            ? "ambiguous"
            : "missing or incompatible";
        throw new StructuralEnumCompatibilityError(
            `Required ENUM type "${expected.name}" is ${reason} in the destination Project.`,
        );
    }
}

export interface StructuralEnumAdmission {
    readonly sourceDescriptor: SqlEnvironmentDescriptor;
    readonly requiredEnums: readonly SqlEnumMetadata[];
    readonly relevantSqlIds: readonly string[];
    readonly destinationCatalogRevision: string;
}

/** Compare replay inputs with the immutable evidence admitted initially. */
export function structuralEnumAdmissionStillCompatible(
    sourceDoc: Y.Doc,
    destinationDoc: Y.Doc,
    admission: StructuralEnumAdmission,
): boolean {
    let source: StructuralSqlSnapshot;
    let destination: StructuralSqlSnapshot;
    try {
        source = captureStructuralSqlSnapshot(sourceDoc);
        destination = captureStructuralSqlSnapshot(destinationDoc);
    } catch {
        return false;
    }
    const currentTables = new Map(source.tables.map(table => [table.id, table]));
    const currentInspections = new Map(source.inspections.map(target => [target.id, target]));
    if (
        admission.sourceDescriptor.tables.some(expected =>
            JSON.stringify(currentTables.get(expected.id)) !== JSON.stringify(expected)
        )
        || admission.sourceDescriptor.inspections.some(expected =>
            JSON.stringify(currentInspections.get(expected.id)) !== JSON.stringify(expected)
        )
    ) return false;

    const sourceEnums = uniqueEnumDeclarations(source.catalog);
    const destinationEnums = uniqueEnumDeclarations(destination.catalog);
    return admission.requiredEnums.every(expected => {
        const original = sourceEnums.get(expected.name);
        return original?.objectId === expected.objectId
            && matchesEnum(original, expected)
            && matchesEnum(destinationEnums.get(expected.name), expected);
    });
}

function scopedDescriptor(
    analysis: Extract<Awaited<ReturnType<typeof analyzeScopedSqlEnumDependencies>>, {
        status: "complete";
    }>,
): SqlEnvironmentDescriptor {
    return Object.freeze({
        projectId: analysis.scopedInput.catalog.projectId,
        catalogRevision: analysis.scopedInput.catalog.revision,
        catalogObjects: analysis.scopedInput.catalog.objects,
        tables: analysis.scopedInput.tables,
        inspections: analysis.scopedInput.inspections,
    });
}

/** Synchronous replay admission after the original compiler-backed paste admission. */
export function portableStructuralEnumsStillCompatible(
    destinationDoc: Y.Doc,
    snapshots: Readonly<Record<string, import("../clipboard/itemClipboard").GridTableSnapshot>>,
    currentSourceDoc?: Y.Doc,
    grids: Readonly<Record<string, import("../clipboard/itemClipboard").GridSnapshot>> = {},
    capturedCatalog?: SqlCatalogSnapshot,
    additionalInspections: readonly SqlInspectionTarget[] = [],
    admission?: StructuralEnumAdmission,
): boolean {
    // Query-only Grids can require types without carrying any Table snapshots.
    const catalog = capturedCatalog ?? Object.values(snapshots)[0]?.catalog;
    if (!admission) return false;
    if (!catalog || catalog.revision !== admission.sourceDescriptor.catalogRevision) return false;
    if (Object.values(snapshots).some(snapshot => snapshot.catalog && snapshot.catalog.revision !== catalog.revision)) {
        return false;
    }
    const currentById = new Map([
        ...Object.values(snapshots).map(snapshot => [snapshot.sourceTableId, snapshot.schemaSql] as const),
        [ITEMS_RELATION_ANALYSIS_ID, ITEMS_RELATION_CREATE_SQL] as const,
        ...Object.values(grids).map(grid => [grid.gridId, grid.query] as const),
        ...additionalInspections.map(target => [target.id, target.sql] as const),
    ]);
    const capturedById = new Map([
        ...admission.sourceDescriptor.tables.map(table => [table.id, table.schema] as const),
        ...admission.sourceDescriptor.inspections.map(item => [item.id, item.sql] as const),
    ]);
    if (
        [...capturedById].some(([id, sql]) => currentById.get(id) !== sql)
    ) return false;
    if (currentSourceDoc) {
        const current = readSqlCatalog(currentSourceDoc.guid, currentSourceDoc);
        if (current.status !== "ready") return false;
        const currentEnums = uniqueEnumDeclarations(current.snapshot);
        if (
            admission.requiredEnums.some(expected => {
                const found = currentEnums.get(expected.name);
                return found?.objectId !== expected.objectId || !matchesEnum(found, expected);
            })
        ) return false;
    }
    const destination = readSqlCatalog(destinationDoc.guid, destinationDoc);
    if (destination.status !== "ready") return false;
    const actual = uniqueEnumDeclarations(destination.snapshot);
    return admission.requiredEnums.every(expected => matchesEnum(actual.get(expected.name), expected));
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
    const tables: SqlTableSnapshot[] = listTables(doc).map(entry => {
        const handles = getTableHandles(doc, entry.tableId);
        if (!handles) {
            throw new StructuralEnumCompatibilityError(`Table "${entry.name}" dependency evidence is unavailable.`);
        }
        return { id: entry.tableId, schema: handles.schemaText.toString(), records: records(doc, entry.tableId) };
    });
    tables.push({ id: ITEMS_RELATION_ANALYSIS_ID, schema: ITEMS_RELATION_CREATE_SQL, records: [] });
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

/** Validate exact ordered ENUM meaning, then prove the live snapshots still match the plan. */
export async function assertStructuralEnumCompatibility(
    sourceDoc: Y.Doc,
    destinationDoc: Y.Doc,
    source: StructuralSqlSnapshot,
    relevantIds: ReadonlySet<string>,
): Promise<StructuralEnumAdmission> {
    const destination = captureStructuralSqlSnapshot(destinationDoc);
    const sourceResult = await analyzeScopedSqlEnumDependencies(source as SqlEnvironmentInput, relevantIds);
    if (sourceResult.status !== "complete") {
        throw new StructuralEnumCompatibilityError(
            sourceResult.diagnostics[0]?.message ?? "Structural transfer dependency evidence is unresolved or invalid.",
        );
    }
    const required = sourceResult.requiredEnums;
    if (sourceDoc !== destinationDoc) {
        assertRequiredEnums(destination.catalog, required);
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
    return Object.freeze({
        sourceDescriptor: scopedDescriptor(sourceResult),
        requiredEnums: Object.freeze([...required]),
        relevantSqlIds: Object.freeze([...relevantIds]),
        destinationCatalogRevision: destination.catalog.revision,
    });
}

/** Guard a portable clipboard plan using the catalog captured at Copy time. */
export async function assertPortableStructuralEnumCompatibility(
    destinationDoc: Y.Doc,
    source: StructuralSqlSnapshot,
    relevantIds: ReadonlySet<string>,
): Promise<StructuralEnumAdmission> {
    const destination = captureStructuralSqlSnapshot(destinationDoc);
    const sourceResult = await analyzeScopedSqlEnumDependencies(source as SqlEnvironmentInput, relevantIds);
    if (sourceResult.status !== "complete") {
        throw new StructuralEnumCompatibilityError(
            sourceResult.diagnostics[0]?.message ?? "Structural transfer dependency evidence is unresolved or invalid.",
        );
    }
    assertRequiredEnums(destination.catalog, sourceResult.requiredEnums);
    const latestDestination = captureStructuralSqlSnapshot(destinationDoc);
    if (latestDestination.catalog.revision !== destination.catalog.revision) {
        throw new StructuralEnumCompatibilityError(
            "Destination SQL catalog changed during structural transfer planning.",
        );
    }
    return Object.freeze({
        sourceDescriptor: scopedDescriptor(sourceResult),
        requiredEnums: Object.freeze([...sourceResult.requiredEnums]),
        relevantSqlIds: Object.freeze([...relevantIds]),
        destinationCatalogRevision: destination.catalog.revision,
    });
}
