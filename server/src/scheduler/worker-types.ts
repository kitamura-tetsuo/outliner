import type { SqlCatalogSnapshot } from "../../../shared/src/services/sqlCatalog.js";

export interface JobTableSnapshot {
    id: string;
    schema: string;
    records: { id: string; values: Record<string, unknown>; }[];
}

export interface JobData {
    ruleId: string;
    schemaSql: string;
    ruleSql: string;
    records?: Record<string, unknown>[];
    tables?: { schemaSql: string; records?: Record<string, unknown>[]; }[];
    /** Immutable inputs captured by the scheduler. New jobs always use these. */
    catalog?: SqlCatalogSnapshot;
    tableSnapshots?: JobTableSnapshot[];
    targetTableId?: string;
    timezone: string;
    occurrenceUtcIso: string;
}

export interface JobResult {
    success: boolean;
    rows?: Record<string, unknown>[];
    error?: string;
    catalogRevision?: string;
    targetSchema?: string;
    enumColumns?: Record<string, readonly string[]>;
}
