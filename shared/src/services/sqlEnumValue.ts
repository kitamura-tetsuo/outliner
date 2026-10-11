export interface SqlEnumValueMetadata {
    readonly labels: readonly string[];
}

/** Preserve PostgreSQL ENUM labels exactly while rejecting every unlisted value. */
export function serializeSqlEnumValue(value: unknown, metadata: SqlEnumValueMetadata): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string" || !metadata.labels.includes(value)) {
        throw new Error(`Value ${JSON.stringify(value)} is not a valid ENUM label`);
    }
    return value;
}
