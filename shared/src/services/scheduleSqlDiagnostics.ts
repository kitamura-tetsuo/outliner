export interface ScheduleSqlDiagnostic {
    version: 1;
    sql: string;
    strictAliases: boolean;
    error: string;
}

export interface ScheduleSqlDiagnosticSnapshot {
    sql?: string;
    sqlAliasPolicyVersion?: number;
    sqlValidationDiagnostic?: string;
}

export function serializeScheduleSqlDiagnostic(sql: string, strictAliases: boolean, error: string): string {
    return JSON.stringify({ version: 1, sql, strictAliases, error });
}

export function decodeScheduleSqlDiagnostic(value: unknown): ScheduleSqlDiagnostic | undefined {
    if (typeof value !== "string") return undefined;
    try {
        const parsed = JSON.parse(value) as Partial<ScheduleSqlDiagnostic>;
        if (
            parsed.version !== 1 || typeof parsed.sql !== "string"
            || typeof parsed.strictAliases !== "boolean" || typeof parsed.error !== "string" || !parsed.error
        ) return undefined;
        return parsed as ScheduleSqlDiagnostic;
    } catch {
        return undefined;
    }
}

/** Return only a server rejection that describes the current persisted inputs. */
export function currentScheduleSqlDiagnostic(
    snapshot: ScheduleSqlDiagnosticSnapshot,
): ScheduleSqlDiagnostic | undefined {
    const diagnostic = decodeScheduleSqlDiagnostic(snapshot.sqlValidationDiagnostic);
    if (!diagnostic) return undefined;
    return diagnostic.sql === (snapshot.sql ?? "")
            && diagnostic.strictAliases === (snapshot.sqlAliasPolicyVersion === 1)
        ? diagnostic
        : undefined;
}
