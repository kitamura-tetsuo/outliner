// Blocks rendered inside an OutlinerItem (calendar, yjstable, ...) implement
// their own drag & drop. OutlinerItem registers capture-phase
// `drop`/`dragover`/`dragenter` listeners on the item root, so without an
// opt-out it consumes those gestures (preventDefault +
// stopImmediatePropagation) before the block's own bubble-phase handlers ever
// run.
//
// A block opts out by marking its root element with `data-block-dnd-owner`.
//
// A bare marker claims *every* drag that lands inside the block. That is right
// for a block whose whole surface is a drop target (the calendar month grid),
// but wrong for one that only owns a specific gesture: a table grid owns column
// reordering, yet a file or an outliner item dropped on a body cell still
// belongs to the host item. Such a block adds `data-block-dnd-type` naming the
// `DataTransfer` type its own drags carry, and only those drags are claimed.

/** Attribute a block puts on its root to claim ownership of drags inside it. */
export const BLOCK_DND_OWNER_ATTRIBUTE = "data-block-dnd-owner";

/**
 * Optional attribute narrowing ownership to drags carrying one of these
 * `DataTransfer` types, separated by commas. Without it the block claims every
 * drag inside its subtree. A Layout names two: its own child reordering and the
 * outliner-item drag that moves a visual block into it.
 */
export const BLOCK_DND_TYPE_ATTRIBUTE = "data-block-dnd-type";

const BLOCK_DND_OWNER_SELECTOR = `[${BLOCK_DND_OWNER_ATTRIBUTE}]`;

/** True when the event's target sits inside a block that owns this drag. */
export function isBlockOwnedDragEvent(event: Event): boolean {
    const target = event.target as Element | null;
    const owner = target?.closest?.(BLOCK_DND_OWNER_SELECTOR);
    if (!owner) return false;

    const requiredTypes = (owner.getAttribute(BLOCK_DND_TYPE_ATTRIBUTE) ?? "")
        .split(",").map(type => type.trim()).filter(type => type.length > 0);
    if (requiredTypes.length === 0) return true;

    // `DataTransfer.types` stays readable while the drag is in protected mode
    // (dragenter/dragover), unlike `getData`, so the payload can be identified
    // before the drop.
    const types = (event as DragEvent).dataTransfer?.types;
    if (types === undefined) return false;
    const carried = new Set(Array.from(types));
    return requiredTypes.some(type => carried.has(type));
}
