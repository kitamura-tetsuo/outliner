export interface JobData {
    ruleId: string;
    schemaSql: string;
    ruleSql: string;
    records?: Record<string, unknown>[];
    tables?: { schemaSql: string; records?: Record<string, unknown>[]; }[];
    timezone: string;
    occurrenceUtcIso: string;
}

export interface JobResult {
    success: boolean;
    rows?: Record<string, unknown>[];
    error?: string;
}
