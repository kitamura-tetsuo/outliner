/** Serializable evidence produced by an actual Project SELECT execution. */
export interface SelectRelationEvidence {
    kind: "table" | "system";
    id: string;
    sqlName: string;
    schemaRevision: string;
    columns: readonly string[];
}
export interface SelectProvenanceEvidence {
    queryId: string;
    queryRevision: number;
    query: string;
    executionGeneration: number;
    catalogGeneration: number;
    catalogRevision?: string;
    /** Producer certification of all physical dependencies of this execution. */
    dependencyStatus: "proven" | "unknown";
    sources: readonly SelectRelationEvidence[];
    columns: readonly { name: string; typeId?: number; }[];
}
