// Candidate columns for the role-assignment editor.
//
// Candidates are the columns the calendar's query actually returns, in result
// order — never a schema's columns, since a calendar has no schema (the same
// principle as the table feature's cell-component list following the SELECT,
// docs/crdt-sql-architecture.md §6.3). Changing the query re-derives this
// list, but an assignment for a column that is temporarily absent must
// survive rather than being pruned: `mergeCandidates` keeps any currently
// assigned column visible (labeled as such by the caller) even when the
// latest result does not carry it, so the UI never silently drops what the
// user chose.

/**
 * Merge the query's current result columns with whatever is currently
 * assigned (a role's column name, or every group axis), so an assignment
 * pointing at a column the latest result does not have stays a selectable,
 * visible option instead of disappearing.
 */
export function mergeCandidates(resultColumns: string[], assigned: (string | undefined)[]): string[] {
    const missing = assigned.filter((value): value is string => !!value && !resultColumns.includes(value));
    if (missing.length === 0) return resultColumns;

    const merged: string[] = [];
    const seen = new Set<string>();
    for (const column of [...missing, ...resultColumns]) {
        if (seen.has(column)) continue;
        seen.add(column);
        merged.push(column);
    }
    return merged;
}
