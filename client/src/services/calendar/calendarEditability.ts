// Whether a calendar's query result can be dragged/edited at all.
//
// A calendar has no schema of its own — no per-column editability question
// the way a table's `analyzeQueryEditability` answers (see queryAnalysis.ts).
// Its result is either addressable, through `source_kind` + `source_id`
// (docs/crdt-sql-architecture.md §4.4, §6.3), or it is not: there is no
// partial state, since every write a calendar makes (drag, resize, lane drop)
// goes through `relationRowWrite.ts` addressed by that pair.

import { SOURCE_ID_COLUMN, SOURCE_KIND_COLUMN } from "../yjstable/queryAnalysis";

export interface CalendarEditability {
    /** True when entries in the result may be dragged/written at all. */
    editable: boolean;
    /** Human-readable explanation, present exactly when `editable` is false. */
    readOnlyReason?: string;
}

export function analyzeCalendarEditability(resultColumns: string[]): CalendarEditability {
    const hasSourceKind = resultColumns.includes(SOURCE_KIND_COLUMN);
    const hasSourceId = resultColumns.includes(SOURCE_ID_COLUMN);
    if (hasSourceKind && hasSourceId) return { editable: true };
    return {
        editable: false,
        readOnlyReason: `Read-only calendar: the query must SELECT both "${SOURCE_KIND_COLUMN}" and `
            + `"${SOURCE_ID_COLUMN}" so an entry can be addressed for a write. Nothing on this calendar `
            + "can be dragged until it does.",
    };
}
