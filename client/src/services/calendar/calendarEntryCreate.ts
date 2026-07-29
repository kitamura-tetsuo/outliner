// Creating a new calendar entry (#4349): always a new outline item, since a
// calendar has no data of its own and there is no relation but the items
// relation this feature defines INSERT semantics for (§4.3). The INSERT
// therefore always targets `ITEMS_RELATION_NAME` directly, addressed by its
// own physical columns ("text", "all_day", "start_on"/"start_at", "due") —
// never the calendar query's own output aliases, which describe how to *read*
// an arbitrary result, not how to write the fixed shape a new item always has.
//
// The destination (which item the new item is created under) is never
// implicit — `assertWriteAllowed` (relationProvider.ts) already refuses an
// INSERT into the items relation with no destination, and this module's only
// job is to shape `values` and dispatch through the same `applyWrite` every
// other write goes through, so nothing here bypasses that capability check.

import { utcMsToFloatingDate } from "$shared/utils/zonedTime";
import { ITEMS_RELATION_NAME } from "../yjstable/itemsRelation";
import type { RelationInsertDestination, RelationValue } from "../yjstable/relationProvider";
import { RelationWriteError } from "../yjstable/relationProvider";
import type { RelationResolver } from "../yjstable/relationRowWrite";

export interface NewCalendarEntryInput {
    title: string;
    /** Whether `startMs` (when present) is a floating date or an instant. */
    allDay: boolean;
    /** Epoch ms; omitted for a title-only item (or a due-only one, via `dueMs`). */
    startMs?: number;
    /** Epoch ms deadline; independent of `startMs` (§6.1 — `due` is never derived from `start`). */
    dueMs?: number;
    /**
     * The calendar's timezone (§6.5), in which an all-day value's floating
     * date is derived. Without it a new all-day entry created near either end
     * of the viewer's day would be stored on the UTC day rather than the day
     * the user picked.
     */
    timeZone: string;
}

function formatDate(ms: number, allDay: boolean, timeZone: string): string {
    return allDay ? utcMsToFloatingDate(ms, timeZone) : new Date(ms).toISOString();
}

/**
 * Create a new outline item through the items relation's INSERT, under
 * `destination`. Throws `RelationWriteError` when the items relation is not
 * available (a project with no materialized schema, say) or when the
 * destination does not resolve — the same error a caller would get calling
 * `applyWrite` directly.
 */
export async function createCalendarEntry(
    resolver: RelationResolver,
    destination: RelationInsertDestination,
    input: NewCalendarEntryInput,
): Promise<void> {
    const provider = await resolver.resolveRelation(ITEMS_RELATION_NAME);
    if (!provider) {
        throw new RelationWriteError(`Relation "${ITEMS_RELATION_NAME}" is not available in this project`);
    }

    const values: Record<string, RelationValue> = { text: input.title };
    if (input.startMs !== undefined) {
        values.all_day = input.allDay;
        values[input.allDay ? "start_on" : "start_at"] = formatDate(input.startMs, input.allDay, input.timeZone);
    }
    if (input.dueMs !== undefined) {
        values.due = formatDate(input.dueMs, input.allDay, input.timeZone);
    }

    await provider.applyWrite({ op: "INSERT", values, destination });
}
