// Blocks rendered inside an OutlinerItem (calendar, yjstable, ...) implement
// their own drag & drop. OutlinerItem registers capture-phase `drop`/`dragover`
// listeners on the item root, so without an opt-out it consumes those gestures
// (preventDefault + stopImmediatePropagation) before the block's own
// bubble-phase handlers ever run.
//
// A block opts out by marking its root element with `data-block-dnd-owner`.

/** Attribute a block puts on its root to claim ownership of drags inside it. */
export const BLOCK_DND_OWNER_ATTRIBUTE = "data-block-dnd-owner";

const BLOCK_DND_OWNER_SELECTOR = `[${BLOCK_DND_OWNER_ATTRIBUTE}]`;

/** True when the event's target sits inside a block that owns its own drag & drop. */
export function isBlockOwnedDragEvent(event: Event): boolean {
    const target = event.target as Element | null;
    return !!target?.closest?.(BLOCK_DND_OWNER_SELECTOR);
}
