// Per-user, per-project history of previously chosen INSERT destinations for
// the calendar's "new entry" flow (#4349).
//
// There is no implicit inbox: creating a calendar entry always asks the user
// to choose which item the new item is created under, and this module is
// what turns "previously chosen destinations offered as history" into
// something concrete. It is deliberately local-storage only, never Yjs:
//
//   - It is per-user convenience, not shared truth — two collaborators on the
//     same project have different habits, and syncing one person's recent
//     destinations to everyone would add noise without meaning.
//   - Nothing here reaches the project doc, so it creates no CRDT churn and
//     no undo entries.
//
// Scoped per project (via the storage key) so destinations from one project
// never leak into another, ordered by recency, and capped at a small number
// of entries. Mirrors the plain-localStorage pattern of `SearchHistoryStore`,
// but as project-parameterized functions rather than a singleton store,
// since "per project" is a call argument here, not a fixed module scope.

import { browser } from "$app/environment";

export interface CalendarDestinationHistoryEntry {
    /** Tree key of the parent item the new entry would be created under. */
    parentKey: string;
    /** Human-readable label for display — the destination's own text is not guaranteed to still exist. */
    label: string;
}

const STORAGE_PREFIX = "calendarDestinationHistory:";
const MAX_HISTORY = 8;

function storageKey(projectId: string): string {
    return `${STORAGE_PREFIX}${projectId}`;
}

function readRaw(projectId: string): CalendarDestinationHistoryEntry[] {
    if (!browser) return [];
    try {
        const raw = localStorage.getItem(storageKey(projectId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (entry): entry is CalendarDestinationHistoryEntry =>
                Boolean(entry) && typeof entry.parentKey === "string" && typeof entry.label === "string",
        );
    } catch {
        return [];
    }
}

function persist(projectId: string, entries: CalendarDestinationHistoryEntry[]): void {
    if (!browser) return;
    localStorage.setItem(storageKey(projectId), JSON.stringify(entries));
}

/** The current history, most recently used first. */
export function getDestinationHistory(projectId: string): CalendarDestinationHistoryEntry[] {
    return readRaw(projectId);
}

/**
 * Record a destination as just used: moves it to the front (deduping by
 * `parentKey`), caps the list at `MAX_HISTORY`, and persists it. Returns the
 * new list.
 */
export function recordDestination(
    projectId: string,
    entry: CalendarDestinationHistoryEntry,
): CalendarDestinationHistoryEntry[] {
    const next = [entry, ...readRaw(projectId).filter((e) => e.parentKey !== entry.parentKey)].slice(0, MAX_HISTORY);
    persist(projectId, next);
    return next;
}

/**
 * Drop any history entry `isResolvable` rejects (its item no longer exists,
 * say) rather than offering a destination that would fail. Persists only
 * when something actually changed, and returns the resulting list either way.
 */
export function pruneUnresolvableDestinations(
    projectId: string,
    isResolvable: (parentKey: string) => boolean,
): CalendarDestinationHistoryEntry[] {
    const current = readRaw(projectId);
    const next = current.filter((e) => isResolvable(e.parentKey));
    if (next.length !== current.length) persist(projectId, next);
    return next;
}
