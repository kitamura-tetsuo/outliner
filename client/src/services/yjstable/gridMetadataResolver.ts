import type * as Y from "yjs";
import type { ProjectQueryProvenance, ProvenanceRelation } from "./projectQueryProvenance";
import { isProjectQueryProvenanceCurrent } from "./projectQueryProvenance";
import type { ProjectSelectEvidence, ProjectSelectSession } from "./projectSelectSession";
import type { TableColumnSchema } from "./schemaIntrospection";
import { getTableSqlName } from "./tableDocs";
import { createTableEngineSession, type TableDocConnector, type TableEngineSession } from "./tableEngine";

export interface GridResultColumnMetadata {
    index: number;
    name: string;
    /** PostgreSQL result type evidence; this does not imply a physical field. */
    typeId?: number;
}

export interface GridPhysicalColumnMetadata {
    outputIndex: number;
    outputColumn: string;
    physicalColumn: string;
    source: ProvenanceRelation;
    /** Present only when the exact Table schema used by the execution is still current. */
    field?: TableColumnSchema;
}

export type GridMetadataStatus = "resolved" | "partial" | "unsupported" | "unavailable" | "relation-free";

export interface GridMetadataResolution {
    status: GridMetadataStatus;
    reason?: string;
    columns: GridResultColumnMetadata[];
    rows: Record<string, unknown>[];
    physicalColumns: GridPhysicalColumnMetadata[];
    /** Exact completed execution/provenance incarnation this metadata describes. */
    evidenceFingerprint: string;
}

export interface GridMetadataResolver {
    resolve(
        evidence: ProjectSelectEvidence,
        provenance: ProjectQueryProvenance,
        session: Pick<ProjectSelectSession, "isEvidenceCurrent" | "isProjectContext">,
    ): Promise<GridMetadataResolution>;
    dispose(): void;
}

/**
 * Joins completed SELECT evidence to live, source-specific Table schemas.
 * The returned value is descriptive only: neither this service nor its output
 * contains a provider handle or grants permission to mutate a source.
 */
export function createGridMetadataResolver(options: {
    projectDoc: Y.Doc;
    projectId?: string;
    connect?: TableDocConnector;
}): GridMetadataResolver {
    let engine: TableEngineSession | undefined;
    let generation = 0;
    let disposed = false;

    const release = () => {
        engine?.dispose();
        engine = undefined;
    };

    return {
        async resolve(evidence, provenance, session) {
            const request = ++generation;
            release();
            const base = resultEvidence(evidence, provenance);
            if (
                disposed || !session.isProjectContext(options.projectDoc, options.projectId)
                || !current(evidence, provenance, session)
            ) {
                return unavailable(base, "The query, catalog, or source evidence is no longer current");
            }
            if (evidence.sources.length === 0) {
                return { ...base, status: "relation-free", physicalColumns: [] };
            }
            if (provenance.status !== "proven") {
                return {
                    ...base,
                    status: provenance.status === "unsupported" ? "unsupported" : "unavailable",
                    reason: provenance.reason,
                    physicalColumns: [],
                };
            }

            const ownedEngine = createTableEngineSession(options);
            engine = ownedEngine;
            const schemas = new Map<string, Map<string, TableColumnSchema>>();
            let missing = false;
            for (const source of provenance.suppliers) {
                if (source.kind !== "table") continue;
                if (getTableSqlName(options.projectDoc, source.id) !== source.sqlName) {
                    missing = true;
                    continue;
                }
                const acquired = await ownedEngine.acquire(source.id);
                if (disposed || request !== generation || engine !== ownedEngine) {
                    ownedEngine.dispose();
                    return unavailable(base, "Metadata resolution was reconfigured or disposed");
                }
                const liveSchema = acquired?.adapter.appliedSchema;
                if (
                    !acquired || !liveSchema || liveSchema.tableName !== source.sqlName
                    || acquired.handles.schemaText.toString() !== source.schemaRevision
                ) {
                    missing = true;
                    continue;
                }
                schemas.set(sourceKey(source), new Map(liveSchema.columns.map(column => [column.name, column])));
            }
            if (!current(evidence, provenance, session)) {
                release();
                return unavailable(base, "The query, catalog, or source evidence changed during metadata resolution");
            }

            const outputIndexes = new Map(evidence.columns.map((column, index) => [column.name, index]));
            const physicalColumns = provenance.branches.flatMap(branch =>
                branch.columns.map(mapping => {
                    const field = schemas.get(sourceKey(branch.source))?.get(mapping.physicalColumn);
                    return {
                        outputIndex: outputIndexes.get(mapping.outputColumn)!,
                        outputColumn: mapping.outputColumn,
                        physicalColumn: mapping.physicalColumn,
                        source: mapping.source,
                        field: field ? cloneField(field) : undefined,
                    };
                })
            );
            const incomplete = missing || physicalColumns.some(column => column.field === undefined);
            return {
                ...base,
                status: incomplete ? "partial" : "resolved",
                reason: incomplete ? "Some physical source metadata is unavailable" : undefined,
                physicalColumns,
            };
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            generation++;
            release();
        },
    };
}

function current(
    evidence: ProjectSelectEvidence,
    provenance: ProjectQueryProvenance,
    session: Pick<ProjectSelectSession, "isEvidenceCurrent">,
): boolean {
    return session.isEvidenceCurrent(evidence) && isProjectQueryProvenanceCurrent(provenance, evidence);
}

function resultEvidence(evidence: ProjectSelectEvidence, provenance: ProjectQueryProvenance) {
    return {
        evidenceFingerprint: provenance.fingerprint,
        columns: evidence.columns.map((column, index) => ({ index, name: column.name, typeId: column.typeId })),
        rows: evidence.rows,
    };
}

function unavailable(
    base: ReturnType<typeof resultEvidence>,
    reason: string,
): GridMetadataResolution {
    return { ...base, status: "unavailable", reason, physicalColumns: [] };
}

function sourceKey(source: ProvenanceRelation): string {
    return `${source.kind}:${source.id}:${source.sqlName}:${source.schemaRevision}`;
}

function cloneField(field: TableColumnSchema): TableColumnSchema {
    return {
        ...field,
        checkOptions: field.checkOptions ? [...field.checkOptions] : undefined,
        enumLabels: field.enumLabels ? [...field.enumLabels] : undefined,
    };
}
