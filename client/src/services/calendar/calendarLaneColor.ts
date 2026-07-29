// Deterministic colour for a lane label, used where lanes are not a layout
// axis (month view, §6.3's "Not a layout" row of the per-view table) so a
// lane still reads as a colour-coded group rather than disappearing.
//
// A stable hash over the label, not an index into the current lane list: an
// index would recolour every other lane whenever one lane's membership
// changes, which is the same "same data looks different depending on where
// you stand" failure the viewer-timezone decision (§6.5) rejected.

const PALETTE = [
    "#2563eb",
    "#dc2626",
    "#16a34a",
    "#d97706",
    "#7c3aed",
    "#0891b2",
    "#db2777",
    "#65a30d",
];

/** The `(none)` / NULL lane always gets the same neutral colour, never a palette slot. */
const NULL_LANE_COLOR = "#6b7280";

function hashLabel(label: string): number {
    let hash = 0;
    for (let i = 0; i < label.length; i++) {
        hash = (hash * 31 + label.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

/** Deterministic colour for a lane's combined label (see `collapseLanePath`). */
export function laneColor(label: string): string {
    if (label === "(none)") return NULL_LANE_COLOR;
    return PALETTE[hashLabel(label) % PALETTE.length];
}
