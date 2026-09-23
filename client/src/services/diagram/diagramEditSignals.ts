// Shared identity of local Diagram source edits and their observable refusal
// (issue #5311). Kept apart from diagramEditing.ts so the undo scope and the
// editing adapter can both depend on it without importing each other.

/**
 * Transaction origin of every local Diagram source edit. The project's Diagram
 * undo scope tracks exactly this origin, so source edits join the user-facing
 * history while programmatic writes (seeding, remote updates) do not.
 */
export const DIAGRAM_SOURCE_EDIT_ORIGIN = { name: "diagram-source-edit" } as const;

export interface DiagramEditRefusal {
    itemId?: string;
    reason: "unauthorized" | "cross-owner-range" | "unavailable";
}

/** Observable refusal of a Diagram edit, reported before any canonical mutation. */
export function reportDiagramEditRefusal(refusal: DiagramEditRefusal): void {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("diagram-edit-refused", { detail: refusal }));
    }
}
