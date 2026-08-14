/**
 * The window events a cross-project Grid paste raises while it runs.
 *
 * They live apart from the paste implementation so that the outline can listen
 * for them without pulling the table/PGlite stack into its own module graph.
 */

/** Progress of the running paste, for the outline to surface. */
export const GRID_PASTE_PROGRESS_EVENT = "grid-paste-progress";

/** Raised by the outline when the user asks to abandon a running paste. */
export const GRID_PASTE_CANCEL_EVENT = "grid-paste-cancel";

/**
 * Cancelable: the outline calls `preventDefault()` when the destination is
 * read-only, and the paste then creates nothing at all (spec §9.5).
 */
export const GRID_PASTE_WRITE_CHECK_EVENT = "grid-paste-write-check";

export type GridPasteProgress =
    | { state: "copying"; tableCount: number; }
    | { state: "complete-with-data"; report: string[]; }
    | { state: "complete-without-data"; reason: string; report: string[]; }
    | { state: "cancelled"; }
    | { state: "failed"; reason: string; };
