export interface ScheduleRowIdentityError {
    code: "invalid_row_id";
    rowIndex: number;
    message: string;
}

/**
 * Validate the identity contract used when scheduler rows become Yjs records.
 * Keep this check shared by preview and execution so SQL-valid but
 * non-persistable identities can never produce a false-success preview.
 */
export function validateScheduleRowIdentities(
    rows: ReadonlyArray<Record<string, unknown>>,
): ScheduleRowIdentityError | undefined {
    const rowIndex = rows.findIndex(row => !row.id);
    return rowIndex < 0
        ? undefined
        : {
            code: "invalid_row_id",
            rowIndex,
            message: "Schedule result rows require a non-empty, non-zero id",
        };
}
