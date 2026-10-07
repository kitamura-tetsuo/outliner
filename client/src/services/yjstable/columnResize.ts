// Pointer lifecycle for resizing one Grid column by dragging its header
// boundary (issue #5459).
//
// The preview is local, transient state: nothing is written while the pointer
// moves. A valid release commits at most one final width through the shared
// width operation (`setGridColumnWidth`, one isolated Undo step); every other
// terminal event (Escape, pointercancel, capture loss, window blur, unmount,
// or an observed invalidation) discards the preview without touching the
// document. The gesture is closed before pointer capture is released, so a
// trailing `lostpointercapture` or duplicate terminal event is a no-op and
// can never roll back or repeat a completed commit.

import * as Y from "yjs";
import {
    getGridRegistry,
    GRID_COLUMN_WIDTH_MAX,
    GRID_COLUMN_WIDTH_MIN,
    type GridHandles,
    setGridColumnWidth,
} from "./gridDocs";

/** Clamp a candidate width into the storable 32..4096 CSS-px range. */
export function clampColumnWidth(px: number): number {
    return Math.min(GRID_COLUMN_WIDTH_MAX, Math.max(GRID_COLUMN_WIDTH_MIN, px));
}

/**
 * The candidate width for a gesture that started at `startWidth` (measured
 * border-box px, possibly fractional for an auto column) and has moved
 * `displacement` px in Grid content coordinates. `undefined` means the
 * gesture has no net rounded size change: a zero-effect no-op that must not
 * convert an automatic column to a fixed one.
 */
export function resizeCandidate(startWidth: number, displacement: number): number | undefined {
    if (Math.round(displacement) === 0) return undefined;
    return clampColumnWidth(Math.round(startWidth + displacement));
}

/** The raw stored `widthPx` leaf of one column (no validation). */
function rawSavedWidth(entry: Y.Map<unknown>, column: string): unknown {
    const components = entry.get("components");
    if (!(components instanceof Y.Map)) return undefined;
    const cfg = components.get(column);
    return cfg instanceof Y.Map ? cfg.get("widthPx") : undefined;
}

function isColumnHidden(entry: Y.Map<unknown>, column: string): boolean {
    const components = entry.get("components");
    if (!(components instanceof Y.Map)) return false;
    const cfg = components.get(column);
    return cfg instanceof Y.Map && cfg.get("hidden") === true;
}

export type ColumnResizeOutcome = "committed" | "noop" | "cancelled";

export interface ColumnResizeOptions {
    /** The Grid whose live entry the gesture captures at start. */
    grid: GridHandles;
    /** Exact result-column name (never a display label or position). */
    column: string;
    /** The dedicated resize handle that received the pointerdown. */
    handle: HTMLElement;
    /** The Grid's horizontal scroll container (content coordinates). */
    scroller: HTMLElement;
    /** The target header's rendered border-box width at start. */
    startWidth: number;
    /**
     * Host-side validity (column still rendered, host still editable). The
     * gesture re-checks it on every move and before committing.
     */
    canContinue: () => boolean;
    /** Local preview width, or undefined to show the committed width. */
    onPreview: (width: number | undefined) => void;
    /** Called exactly once when the gesture terminates. */
    onEnd: (outcome: ColumnResizeOutcome) => void;
}

/**
 * One active header-resize gesture. Construct it from the handle's
 * pointerdown; it owns its listeners and pointer capture until it ends.
 */
export class ColumnResizeGesture {
    readonly column: string;
    private readonly options: ColumnResizeOptions;
    private readonly entry: Y.Map<unknown>;
    private readonly registry: Y.Map<Y.Map<unknown>>;
    private readonly pointerId: number;
    private readonly startSaved: unknown;
    private readonly startContentX: number;
    private lastClientX: number;
    private candidate: number | undefined;
    private active = true;
    /** Pointer whose release still has to be swallowed after a cancel. */
    private releaseGuard: ((event: PointerEvent) => void) | undefined;
    private clickGuard: ((event: MouseEvent) => void) | undefined;
    private clickGuardTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(options: ColumnResizeOptions, event: PointerEvent) {
        this.options = options;
        this.column = options.column;
        this.entry = options.grid.entry;
        this.registry = getGridRegistry(options.grid.projectDoc);
        this.pointerId = event.pointerId;
        this.startSaved = rawSavedWidth(this.entry, this.column);
        this.lastClientX = event.clientX;
        this.startContentX = this.contentX(event.clientX);

        window.addEventListener("pointermove", this.onPointerMove, true);
        window.addEventListener("pointerup", this.onPointerUp, true);
        window.addEventListener("pointercancel", this.onPointerCancel, true);
        window.addEventListener("keydown", this.onKeyDown, true);
        window.addEventListener("blur", this.onBlur);
        options.handle.addEventListener("lostpointercapture", this.onLostCapture);
        options.scroller.addEventListener("scroll", this.onScroll);
        this.entry.observeDeep(this.onEntryChange);
        this.registry.observe(this.onRegistryChange);
        try {
            options.handle.setPointerCapture(event.pointerId);
        } catch {
            // Capture is an optimization: the window-level listeners above
            // still follow the pointer when the platform refuses capture.
        }
    }

    get isActive(): boolean {
        return this.active;
    }

    /** Re-check validity after a host-side change (rendered set, read-only). */
    revalidate(): void {
        if (this.active && !this.isValid()) this.cancel();
    }

    /** Terminate without any saved-width update (idempotent). */
    cancel(): void {
        if (!this.close()) return;
        // The button may still be down: swallow its eventual release and the
        // click it synthesizes so it cannot select or reorder anything.
        this.guardRelease();
        this.options.onEnd("cancelled");
    }

    /** Cancel and drop every residual listener (component unmount). */
    dispose(): void {
        this.cancel();
        this.dropReleaseGuard();
        this.dropClickGuard();
    }

    private contentX(clientX: number): number {
        const { scroller } = this.options;
        return clientX - scroller.getBoundingClientRect().left + scroller.scrollLeft;
    }

    private isValid(): boolean {
        const { grid, canContinue } = this.options;
        if (grid.entry !== this.entry) return false;
        if (this.registry.get(grid.gridId) !== this.entry) return false;
        if (!Object.is(rawSavedWidth(this.entry, this.column), this.startSaved)) return false;
        if (isColumnHidden(this.entry, this.column)) return false;
        return canContinue();
    }

    private update(clientX: number): void {
        this.lastClientX = clientX;
        const next = resizeCandidate(this.options.startWidth, this.contentX(clientX) - this.startContentX);
        if (next === this.candidate) return;
        this.candidate = next;
        this.options.onPreview(next);
    }

    /**
     * Mark the gesture finished and release everything it owns. Returns
     * false when it had already ended, so every terminal path is idempotent.
     * The gesture closes before capture is released: the resulting
     * `lostpointercapture` then finds nothing to cancel.
     */
    private close(): boolean {
        if (!this.active) return false;
        this.active = false;
        window.removeEventListener("pointermove", this.onPointerMove, true);
        window.removeEventListener("pointerup", this.onPointerUp, true);
        window.removeEventListener("pointercancel", this.onPointerCancel, true);
        window.removeEventListener("keydown", this.onKeyDown, true);
        window.removeEventListener("blur", this.onBlur);
        this.options.handle.removeEventListener("lostpointercapture", this.onLostCapture);
        this.options.scroller.removeEventListener("scroll", this.onScroll);
        this.entry.unobserveDeep(this.onEntryChange);
        this.registry.unobserve(this.onRegistryChange);
        try {
            if (this.options.handle.hasPointerCapture?.(this.pointerId)) {
                this.options.handle.releasePointerCapture(this.pointerId);
            }
        } catch {
            // Already released by the platform.
        }
        this.options.onPreview(undefined);
        return true;
    }

    private finishRelease(clientX: number): void {
        if (!this.active) return;
        this.update(clientX);
        const width = this.candidate;
        const valid = this.isValid();
        this.close();
        this.guardClick();
        if (!valid) {
            this.options.onEnd("cancelled");
            return;
        }
        if (width === undefined) {
            this.options.onEnd("noop");
            return;
        }
        // The shared width operation: one isolated Grid Undo step, or a
        // canonical no-op when the value already equals the override.
        setGridColumnWidth(this.options.grid, this.column, width);
        this.options.onEnd("committed");
    }

    /** Swallow the click a release synthesizes (same task as pointerup). */
    private guardClick(): void {
        this.dropClickGuard();
        const guard = (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            this.dropClickGuard();
        };
        this.clickGuard = guard;
        window.addEventListener("click", guard, true);
        this.clickGuardTimer = setTimeout(() => this.dropClickGuard(), 0);
    }

    private dropClickGuard(): void {
        if (this.clickGuard) window.removeEventListener("click", this.clickGuard, true);
        this.clickGuard = undefined;
        if (this.clickGuardTimer !== undefined) clearTimeout(this.clickGuardTimer);
        this.clickGuardTimer = undefined;
    }

    private guardRelease(): void {
        this.dropReleaseGuard();
        const guard = (event: PointerEvent) => {
            if (event.pointerId !== this.pointerId) return;
            this.dropReleaseGuard();
            if (event.type === "pointerup") {
                event.stopPropagation();
                this.guardClick();
            }
        };
        this.releaseGuard = guard;
        window.addEventListener("pointerup", guard, true);
        window.addEventListener("pointercancel", guard, true);
    }

    private dropReleaseGuard(): void {
        if (!this.releaseGuard) return;
        window.removeEventListener("pointerup", this.releaseGuard, true);
        window.removeEventListener("pointercancel", this.releaseGuard, true);
        this.releaseGuard = undefined;
    }

    private readonly onPointerMove = (event: PointerEvent) => {
        if (event.pointerId !== this.pointerId || !this.active) return;
        if (!this.isValid()) {
            this.cancel();
            return;
        }
        event.preventDefault();
        this.update(event.clientX);
    };

    private readonly onPointerUp = (event: PointerEvent) => {
        if (event.pointerId !== this.pointerId) return;
        event.stopPropagation();
        this.finishRelease(event.clientX);
    };

    private readonly onPointerCancel = (event: PointerEvent) => {
        if (event.pointerId !== this.pointerId) return;
        this.cancel();
    };

    private readonly onLostCapture = (event: PointerEvent) => {
        if (event.pointerId !== this.pointerId) return;
        this.cancel();
    };

    private readonly onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        this.cancel();
    };

    private readonly onBlur = () => this.cancel();

    // Scrolling moves the header under a stationary pointer: recompute the
    // displacement in content coordinates from the last pointer position.
    private readonly onScroll = () => {
        if (this.active) this.update(this.lastClientX);
    };

    // Observed updates: a change of this column's saved width (or its
    // visibility) invalidates the gesture for good, even if a later update
    // restores the old number. Unrelated changes leave it bound.
    private readonly onEntryChange = () => this.revalidate();

    private readonly onRegistryChange = () => this.revalidate();
}
