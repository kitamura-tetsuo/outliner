import type * as Y from "yjs";
import type { GridMetadataResolution, GridPhysicalColumnMetadata } from "./gridMetadataResolver";
import type { ProjectQueryProvenance, ProvenanceRelation } from "./projectQueryProvenance";
import { isProjectQueryProvenanceCurrent } from "./projectQueryProvenance";
import type { ProjectSelectEvidence, ProjectSelectSession } from "./projectSelectSession";
import { assertWriteAllowed, type RelationProvider, type RelationValue, RelationWriteError } from "./relationProvider";
import type { TableColumnSchema } from "./schemaIntrospection";
import { getTableSqlName } from "./tableDocs";
import { createTableEngineSession, type TableDocConnector, type TableEngineSession } from "./tableEngine";
import { castValueForColumn } from "./valueCasting";

export type GridExistingRowOperation = "UPDATE" | "DELETE";

export interface GridMutationResult {
    source: ProvenanceRelation;
    rowId: string;
    physicalColumn?: string;
}

export interface GridMutationIntent {
    readonly operation: GridExistingRowOperation;
    readonly rowIndex: number;
    readonly outputColumn?: string;
    readonly value?: RelationValue;
}

export interface GridExistingRowMutationBoundary {
    captureUpdate(rowIndex: number, outputColumn: string, value: RelationValue): GridMutationIntent;
    captureDelete(rowIndex: number): GridMutationIntent;
    commit(intent: GridMutationIntent): Promise<GridMutationResult>;
    dispose(): void;
}

export interface GridExistingRowMutationOptions {
    projectDoc: Y.Doc;
    projectId?: string;
    connect?: TableDocConnector;
    session: Pick<ProjectSelectSession, "isEvidenceCurrent" | "isProjectContext">;
    evidence: () => ProjectSelectEvidence | undefined;
    provenance: () => ProjectQueryProvenance | undefined;
    metadata: () => GridMetadataResolution | undefined;
    /** Project admission is checked at capture and again at the effect boundary. */
    canWrite: () => boolean;
    /** The invoking surface may independently restrict an otherwise capable provider. */
    allows: (operation: GridExistingRowOperation, source: ProvenanceRelation, physicalColumn?: string) => boolean;
    /** Optional externally owned relation session, useful when resolution must be coordinated by a caller. */
    relationSession?: Pick<TableEngineSession, "resolveRelation" | "releaseRelation">;
}

interface CapturedIntent extends GridMutationIntent {
    evidence: ProjectSelectEvidence;
    provenance: ProjectQueryProvenance;
    metadata: GridMetadataResolution;
    row: Record<string, unknown>;
    source: ProvenanceRelation;
    rowId: string;
    physical?: GridPhysicalColumnMetadata;
}

/**
 * The single production authorization boundary for writes to existing Project
 * SELECT rows. It captures completed execution evidence, but deliberately
 * acquires the provider only at commit and proves every fact again there.
 */
export function createGridExistingRowMutationBoundary(
    options: GridExistingRowMutationOptions,
): GridExistingRowMutationBoundary {
    const ownedEngine = options.relationSession ? undefined : createTableEngineSession(options);
    const engine = options.relationSession ?? ownedEngine!;
    let disposed = false;
    const captured = new WeakSet<object>();

    function capture(
        operation: GridExistingRowOperation,
        rowIndex: number,
        outputColumn?: string,
        value?: RelationValue,
    ): CapturedIntent {
        if (disposed) refuse("The mutation boundary is disposed");
        const evidence = options.evidence();
        const provenance = options.provenance();
        const metadata = options.metadata();
        if (!evidence || !provenance || !metadata) refuse("Current Grid execution evidence is unavailable");
        if (!current(options, evidence, provenance)) refuse("Current Grid execution evidence is stale");
        if (provenance.status !== "proven" || metadata.status !== "resolved") {
            refuse(
                metadata.reason ?? provenance.reason ?? "Grid source provenance or physical metadata is unavailable",
            );
        }
        if (metadata.evidenceFingerprint !== provenance.fingerprint) {
            refuse("Physical metadata does not belong to the current Grid execution");
        }
        if (!options.canWrite()) refuse("Project write access is unavailable");
        const row = evidence.rows[rowIndex];
        if (!row) refuse("The selected result row no longer exists");
        const identity = evidence.rowIdentities[rowIndex];
        if (
            !identity || row.id !== identity.id || row.source_kind !== identity.sourceKind
            || row.source_id !== identity.sourceId
        ) {
            refuse("The result row identity differs from the completed execution");
        }
        const target = resolveTarget(operation, row, outputColumn, provenance, metadata);
        if (!options.allows(operation, target.source, target.physical?.physicalColumn)) {
            refuse("This Grid surface does not allow the requested source mutation");
        }
        if (operation === "UPDATE") validateValue(value, target.physical!.field!);
        const intent: CapturedIntent = {
            operation,
            rowIndex,
            outputColumn,
            value,
            evidence,
            provenance,
            metadata,
            row,
            source: target.source,
            rowId: target.rowId,
            physical: target.physical,
        };
        captured.add(intent);
        return intent;
    }

    return {
        captureUpdate: (rowIndex, outputColumn, value) => capture("UPDATE", rowIndex, outputColumn, value),
        captureDelete: rowIndex => capture("DELETE", rowIndex),
        async commit(intent) {
            if (!captured.has(intent as object)) refuse("The mutation intent was not created by this boundary");
            const operation = intent as CapturedIntent;
            assertCurrent(options, operation);
            const provider = await engine.resolveRelation(operation.source.sqlName);
            try {
                assertCurrent(options, operation);
                if (!provider) refuse(`The source relation "${operation.source.sqlName}" is unavailable`);
                assertProviderIdentity(provider, operation.source, options.projectDoc);
                const write = operation.operation === "UPDATE"
                    ? {
                        op: "UPDATE" as const,
                        rowId: operation.rowId,
                        column: operation.physical!.physicalColumn,
                        value: operation.value!,
                    }
                    : { op: "DELETE" as const, rowId: operation.rowId };
                assertWriteAllowed(provider.capabilities, write, provider.sqlName);
                if (operation.operation === "DELETE" && provider.capabilities.delete?.requiresDisposition) {
                    refuse(`DELETE from "${provider.sqlName}" requires a user disposition`);
                }
                if (!provider.assertExistingRowWriteAllowed) {
                    refuse(`Relation "${provider.sqlName}" cannot prove its live write target`);
                }
                // No await is allowed between this last complete check and applyWrite:
                // real providers mutate synchronously before their promise resolves.
                assertCurrent(options, operation);
                assertProviderIdentity(provider, operation.source, options.projectDoc);
                provider.assertExistingRowWriteAllowed(write);
                await provider.applyWrite(write);
                captured.delete(operation);
                return {
                    source: operation.source,
                    rowId: operation.rowId,
                    physicalColumn: operation.physical?.physicalColumn,
                };
            } finally {
                if (provider) engine.releaseRelation(provider);
            }
        },
        dispose() {
            disposed = true;
            ownedEngine?.dispose();
        },
    };
}

function resolveTarget(
    operation: GridExistingRowOperation,
    row: Record<string, unknown>,
    outputColumn: string | undefined,
    provenance: ProjectQueryProvenance,
    metadata: GridMetadataResolution,
) {
    let source: ProvenanceRelation;
    let rowId: string;
    if (provenance.branches.length === 1 && provenance.bareIdSource) {
        source = provenance.bareIdSource;
        rowId = requiredIdentity(row.id, "id");
    } else {
        const kind = requiredIdentity(row.source_kind, "source_kind");
        rowId = requiredIdentity(row.source_id, "source_id");
        const matches = provenance.branches.filter(branch => branch.routedIdentity && branch.source.sqlName === kind);
        if (matches.length !== 1) refuse("The UNION row has no unique verified branch identity");
        source = matches[0]!.source;
    }
    if (operation === "DELETE") return { source, rowId, physical: undefined };
    if (!outputColumn) refuse("An UPDATE requires a result column");
    const matches = metadata.physicalColumns.filter(column =>
        column.outputColumn === outputColumn && sameSource(column.source, source)
    );
    if (matches.length !== 1 || !matches[0]!.field) {
        refuse(`Column "${outputColumn}" has no unique current physical field`);
    }
    return { source, rowId, physical: matches[0]! };
}

function assertCurrent(options: GridExistingRowMutationOptions, intent: CapturedIntent): void {
    if (
        options.evidence() !== intent.evidence || options.provenance() !== intent.provenance
        || options.metadata() !== intent.metadata || intent.evidence.rows[intent.rowIndex] !== intent.row
        || !current(options, intent.evidence, intent.provenance)
    ) refuse("The Grid query, result, catalog, or source authority changed while the mutation was pending");
    if (intent.metadata.evidenceFingerprint !== intent.provenance.fingerprint) {
        refuse("Physical metadata no longer belongs to the captured Grid execution");
    }
    const identity = intent.evidence.rowIdentities[intent.rowIndex];
    if (
        !identity || intent.row.id !== identity.id || intent.row.source_kind !== identity.sourceKind
        || intent.row.source_id !== identity.sourceId
    ) refuse("The result row identity changed while the mutation was pending");
    if (!options.canWrite()) refuse("Project write access was revoked");
    if (!options.allows(intent.operation, intent.source, intent.physical?.physicalColumn)) {
        refuse("This Grid surface no longer allows the requested source mutation");
    }
    if (intent.operation === "UPDATE") validateValue(intent.value, intent.physical!.field!);
}

function current(
    options: GridExistingRowMutationOptions,
    evidence: ProjectSelectEvidence,
    provenance: ProjectQueryProvenance,
): boolean {
    return options.session.isProjectContext(options.projectDoc, options.projectId)
        && options.session.isEvidenceCurrent(evidence)
        && isProjectQueryProvenanceCurrent(provenance, evidence);
}

function assertProviderIdentity(provider: RelationProvider, source: ProvenanceRelation, projectDoc: Y.Doc): void {
    const evidence = provider.evidence;
    if (
        !evidence || evidence.kind !== source.kind || evidence.id !== source.id || provider.sqlName !== source.sqlName
        || evidence.sqlName !== source.sqlName || evidence.schemaRevision !== source.schemaRevision
    ) refuse(`Relation "${source.sqlName}" no longer has the captured physical identity or schema`);
    if (source.kind === "table" && getTableSqlName(projectDoc, source.id) !== source.sqlName) {
        refuse(`Table source "${source.sqlName}" is no longer admitted to this Project`);
    }
}

function validateValue(value: unknown, field: TableColumnSchema): void {
    if ((value === null || value === undefined || value === "") && !field.isNullable) {
        refuse(`Column "${field.name}" does not accept an empty value`);
    }
    try {
        const cast = castValueForColumn(value, field);
        const allowed = field.enumLabels ?? field.checkOptions;
        if (allowed && !allowed.some(candidate => Object.is(candidate, cast))) {
            refuse(`Value is not allowed for column "${field.name}"`);
        }
    } catch (error) {
        refuse(error instanceof Error ? error.message : `Value is invalid for column "${field.name}"`);
    }
}

function requiredIdentity(value: unknown, column: string): string {
    if (typeof value !== "string" || value.length === 0) refuse(`The result has no valid ${column} identity`);
    return value;
}

function sameSource(left: ProvenanceRelation, right: ProvenanceRelation): boolean {
    return left.kind === right.kind && left.id === right.id && left.sqlName === right.sqlName
        && left.schemaRevision === right.schemaRevision;
}

function refuse(message: string): never {
    throw new RelationWriteError(`Grid mutation refused: ${message}`);
}
