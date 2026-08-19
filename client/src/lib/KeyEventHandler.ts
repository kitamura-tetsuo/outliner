import { getItemCalendarId, setItemCalendarId } from "../services/calendar/calendarBinding";
import { type CalendarSettings, createCalendar, getCalendar } from "../services/calendar/calendarService";
import { escapeHtml, serializeGridToHtml, serializeGridToTsv } from "../services/clipboard/gridClipboardExport";
import { GRID_PASTE_PROGRESS_EVENT } from "../services/clipboard/gridPasteEvents";
import {
    clipboardPlainText,
    deserializeClipboardItems,
    type GridTableSnapshot,
    OUTLINER_ITEMS_MIME,
    serializeClipboardItems,
    structuredClipboardFromHtml,
    structuredClipboardHtml,
} from "../services/clipboard/itemClipboard";
import {
    pasteSpecialChoices,
    type PasteSpecialVariant,
    requestPasteSpecialChoice,
} from "../services/clipboard/pasteSpecial";
import { globalUndoRouter } from "../services/undo/undoRouter.svelte";
import { getItemTableId, setItemTableId } from "../services/yjstable/itemBinding";
import { computeSnapshotClosure, computeTableClosure, exportTableStructure } from "../services/yjstable/tableClone";
import { getTableName, listTables } from "../services/yjstable/tableDocs";
import { rewriteTableQuerySql } from "../services/yjstable/tableSqlRewrite";
import { aliasPickerStore } from "../stores/AliasPickerStore.svelte";
import { commandPaletteStore } from "../stores/CommandPaletteStore.svelte";
import { editorOverlayStore as store } from "../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../stores/store.svelte";
import { getTableClipboardSource } from "../stores/tableClipboardRegistry";
import { escapeId } from "../utils/domUtils";
import { insertItemAfterTargetOrAppend } from "../utils/itemUtils";
import { CustomKeyMap } from "./CustomKeyMap";
import { getLogger } from "./logger";
const logger = getLogger("KeyEventHandler");

/** A chart PNG data URI past this is dropped rather than pushed into the clipboard. */
const CHART_IMAGE_LIMIT = 2_000_000;

const CHART_IMAGE_DROPPED_NOTICE = "--- Chart image too large to copy ---";

function reportPasteSpecialVariant(variant: PasteSpecialVariant): void {
    if (typeof window === "undefined") return;
    const message = variant === "another-view"
        ? "Pasted as another view of the source component."
        : variant === "values-only"
        ? "Pasted values only, without component data."
        : variant === "copy-with-data"
        ? "Pasted as an independent copy with data."
        : variant === "copy-without-data"
        ? "Pasted as an independent copy without data."
        : undefined;
    if (message) {
        window.dispatchEvent(
            new CustomEvent(GRID_PASTE_PROGRESS_EVENT, {
                detail: { state: "complete-with-data", report: [message] },
            }),
        );
    }
}

interface StructuredClipboard {
    /** The private payload: bindings and portable structure, unchanged by §7. */
    encoded: string;
    /** `text/plain` — outline text, with each rendered Grid replaced by its TSV. */
    plainText: string;
    /** `text/html` — the visible fragment, with real `<table>`s and chart images. */
    html?: string;
    /** `image/png` — the copied chart, for destinations that accept only an image. */
    pngDataUrl?: string;
    /** True when a cap trimmed the export; the notice travels with the content. */
    truncated?: boolean;
}

/**
 * The rendered export of a Grid, or undefined when nothing is materialized for
 * it. Only a mounted view registers a source, so a collapsed or never-rendered
 * Grid falls through to its display name — the §7 floor, and the reason a copy
 * never has to block on a query.
 */
function renderedGridExport(
    tableId: string,
): { tsv: string; html: string; chartImage?: string; truncated: boolean; } | undefined {
    const source = getTableClipboardSource(tableId);
    const config = source?.getGrid();
    if (!source || !config) return undefined;
    const tsv = serializeGridToTsv(config);
    const table = serializeGridToHtml(config);
    const chartImage = source.getChartImage();
    // A PNG data URI is large, so the §7 size rule governs it too: an oversized
    // image is dropped — and, like a trimmed result, says so where it was.
    const oversized = chartImage !== undefined && chartImage.length > CHART_IMAGE_LIMIT;
    const html = oversized ? `${table.html}\n<p><i>${CHART_IMAGE_DROPPED_NOTICE}</i></p>` : table.html;
    return {
        tsv: tsv.text,
        html,
        chartImage: oversized ? undefined : chartImage,
        truncated: tsv.truncated || table.truncated || oversized,
    };
}

/**
 * Structured clipboard payload for the current cross-item selection.
 *
 * The selection does not have to cover its first and last item completely. A
 * mouse drag practically never stops exactly on an item boundary, and demanding
 * that used to drop the structured payload — and with it every Grid/Calendar
 * binding inside the range — for anything but Ctrl+A. Partially covered edge
 * items contribute only their selected slice, while a component block the
 * selection reaches at all is carried whole because it cannot be copied in
 * halves. An edge the selection stops right at is not reached, so it drops out
 * of the range entirely — component or not.
 *
 * A partial selection only takes this path when it actually holds a component
 * block; plain text ranges keep using the ordinary text clipboard.
 *
 * Outward (§7), a rendered Grid contributes its result rather than its name:
 * TSV to `text/plain`, a real `<table>` to `text/html`, and the chart image
 * alongside both. The private payload is untouched, so pasting back into
 * Outliner behaves exactly as it did.
 */
function selectedItemsClipboardData(operation?: "cut"): StructuredClipboard | undefined {
    const selection = Object.values(store.selections).find(sel =>
        !sel.isBoxSelection && sel.startItemId !== sel.endItemId
    );
    const visible = generalStore.activeViewModel?.getVisibleItems() ?? [];
    const project = generalStore.project;
    if (!selection || !project?.ydoc) return undefined;
    const start = visible.findIndex(entry => entry.model.id === selection.startItemId);
    const end = visible.findIndex(entry => entry.model.id === selection.endItemId);
    if (start < 0 || end < 0) return undefined;
    const first = Math.min(start, end);
    const last = Math.max(start, end);
    const firstLength = String(visible[first].model.original.text ?? "").length;
    const lastLength = String(visible[last].model.original.text ?? "").length;
    const rawStartOffset = start <= end ? selection.startOffset : selection.endOffset;
    const rawEndOffset = start <= end ? selection.endOffset : selection.startOffset;
    const startOffset = Math.max(0, Math.min(firstLength, rawStartOffset));
    const endOffset = Math.max(0, Math.min(lastLength, rawEndOffset));
    const coversWholeRange = startOffset === 0 && endOffset === lastLength;

    let hasComponent = false;
    // Rendered exports keyed by table id. They feed the outward flavors only —
    // the encoded payload keeps carrying the display name, so in-app paste
    // fidelity is exactly what it was.
    const gridExports = new Map<string, NonNullable<ReturnType<typeof renderedGridExport>>>();
    const entries = visible.slice(first, last + 1).flatMap((entry, offset) => {
        const index = first + offset;
        const item = entry.model.original;
        const tableId = getItemTableId(item);
        const calendarId = getItemCalendarId(item);
        const isComponent = Boolean(tableId || calendarId);
        const fallbackText = tableId
            ? getTableName(project.ydoc, tableId)
            : calendarId
            ? getCalendar(project, calendarId)?.name
            : undefined;
        const text = String(item.text ?? "");
        const isEdge = index === first || index === last;
        const sliceStart = index === first ? startOffset : 0;
        const sliceEnd = index === last ? endOffset : text.length;
        // An edge item with an empty slice is one the selection stops at rather
        // than reaches, so it leaves the range — copying its component block
        // would paste a Grid the user never selected. A text-less item has no
        // slice to judge by, so it counts as reached.
        if (isEdge && text.length > 0 && sliceStart >= sliceEnd) return [];
        // Component blocks are atomic: a partial overlap copies the whole block.
        if (isComponent) hasComponent = true;
        if (tableId && !gridExports.has(tableId)) {
            const exported = renderedGridExport(tableId);
            if (exported) gridExports.set(tableId, exported);
        }
        return [{
            item,
            depth: entry.depth,
            fallbackText,
            text: isComponent ? undefined : text.substring(sliceStart, sliceEnd),
        }];
    });
    if (entries.length === 0) return undefined;
    if (!coversWholeRange && !hasComponent) return undefined;

    const tableSnapshots: Record<string, GridTableSnapshot> = {};
    const initialTableIds = new Set(
        entries.map(entry => getItemTableId(entry.item)).filter((id): id is string => id !== undefined),
    );
    const tableIds = computeTableClosure(project.ydoc, initialTableIds);
    for (const tableId of tableIds) {
        try {
            tableSnapshots[tableId] = exportTableStructure(project.ydoc, tableId);
        } catch {
            // Each Grid is portable independently; failed exports retain their
            // source binding for same-project paste and degrade to text abroad.
        }
    }

    const calendarSnapshots: Record<string, CalendarSettings> = {};
    for (const entry of entries) {
        const calendarId = getItemCalendarId(entry.item);
        if (calendarId && !calendarSnapshots[calendarId]) {
            const settings = getCalendar(project, calendarId);
            if (settings) {
                calendarSnapshots[calendarId] = settings;
            }
        }
    }

    // A selection may begin in a nested item and continue past its parent to a
    // shallower sibling (for example, the Recurring Tasks explanation followed
    // by its Grid). Normalizing against the first item would make that sibling's
    // clipboard depth negative, which the strict serializer correctly rejects.
    // Use the shallowest selected item so every depth remains portable while
    // preserving the hierarchy within the copied range.
    //
    // The page title is excluded from that measurement: Ctrl/Cmd+A selects it
    // along with the outline, and it sits one level above every item, so taking
    // it as the baseline would nest the whole page under its own heading when
    // pasted. Its own depth clamps to the baseline instead.
    const pageItemId = generalStore.currentPage?.id;
    const outlineEntries = entries.filter(entry => entry.item.id !== pageItemId);
    const measured = outlineEntries.length > 0 ? outlineEntries : entries;
    const baseDepth = measured.reduce(
        (shallowestDepth, entry) => Math.min(shallowestDepth, entry.depth),
        measured[0].depth,
    );
    const encoded = serializeClipboardItems(
        project.ydoc.guid,
        entries.map(entry => ({ ...entry, depth: Math.max(0, entry.depth - baseDepth) })),
        Object.keys(tableSnapshots).length > 0 ? tableSnapshots : undefined,
        Object.keys(calendarSnapshots).length > 0 ? calendarSnapshots : undefined,
        operation,
    );
    const payload = deserializeClipboardItems(encoded);
    if (!payload) return undefined;

    // Outward flavors. A selection with no rendered Grid produces neither, and
    // the ordinary text/HTML path is used exactly as before.
    if (gridExports.size === 0) return { encoded, plainText: clipboardPlainText(payload) };

    const exportOf = (item: { componentType?: string; yjsTableId?: string; }) =>
        item.componentType === "yjstable" && item.yjsTableId ? gridExports.get(item.yjsTableId) : undefined;

    const plainText = payload.items.map(item => exportOf(item)?.tsv ?? item.text).join("\n");
    const html = payload.items.map(item => {
        const exported = exportOf(item);
        if (!exported) return escapeHtml(item.text).replaceAll("\n", "<br>");
        // The picture and the numbers both belong on the clipboard: a document
        // takes the image, a spreadsheet takes the cells (§8.1).
        return exported.chartImage
            ? `${exported.html}<br><img src="${exported.chartImage}">`
            : exported.html;
    }).join("<br>");

    // One chart in the selection can also ride as an image flavor of its own,
    // for destinations that accept nothing else. Two would have to be one
    // picture, so they stay in the HTML table where both are visible.
    const chartImages = [...gridExports.values()].map(exported => exported.chartImage)
        .filter(image => image !== undefined);
    const pngDataUrl = chartImages.length === 1 ? chartImages[0] : undefined;

    const truncated = [...gridExports.values()].some(exported => exported.truncated);
    return { encoded, plainText, html, pngDataUrl, truncated };
}

/**
 * True when the current selection carries component blocks (Grid/Calendar) that
 * only the structured clipboard path can preserve. Other copy handlers must
 * stand down in that case: writing plain text to the system clipboard would
 * drop the component payload and desynchronise the paste-time fallback, whose
 * cache is keyed on the copied plain text.
 */
export function hasStructuredClipboardSelection(): boolean {
    return selectedItemsClipboardData() !== undefined;
}

/** `data:image/png;base64,…` to a Blob, so the PNG can ride as its own flavor. */
function pngBlobFromDataUrl(dataUrl: string): Blob | undefined {
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    if (!dataUrl.startsWith("data:image/png") || base64.length === 0) return undefined;
    try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: "image/png" });
    } catch {
        return undefined;
    }
}

function writeStructuredSystemClipboard(structured: StructuredClipboard): void {
    if (typeof navigator === "undefined" || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") return;
    const html = structuredClipboardHtml(structured.encoded, structured.plainText, structured.html);
    const png = structured.pngDataUrl ? pngBlobFromDataUrl(structured.pngDataUrl) : undefined;
    const item = new ClipboardItem({
        "text/plain": new Blob([structured.plainText], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
        // Destinations that accept only an image take this one (§8.1).
        ...(png ? { "image/png": png } : {}),
    });
    navigator.clipboard.write([item]).catch((error: unknown) => {
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.error({ error }, "navigator.clipboard.write failed for structured clipboard:");
        }
    });
}

function clearRetainedComponentHost(): void {
    const selection = Object.values(store.selections).find(sel => sel.startItemId !== sel.endItemId);
    const visible = generalStore.activeViewModel?.getVisibleItems() ?? [];
    if (!selection) return;
    const start = visible.findIndex(entry => entry.model.id === selection.startItemId);
    const end = visible.findIndex(entry => entry.model.id === selection.endItemId);
    const retained = visible[Math.min(start, end)]?.model.original;
    if (!retained) return;
    retained.componentType = undefined;
    setItemTableId(retained, undefined);
    setItemCalendarId(retained, undefined);
}

export function isForeignInput(target: EventTarget | null): boolean {
    if (!target) return false;
    const el = target as HTMLElement;
    const tagName = el.tagName?.toUpperCase();
    if (
        tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || tagName === "OPTION"
        || tagName === "BUTTON" || el.getAttribute?.("role") === "gridcell"
        || el.isContentEditable || el.hasAttribute?.("contenteditable")
    ) {
        if (el.classList && el.classList.contains("global-textarea")) {
            return false;
        }
        return true;
    }
    return false;
}

/**
 * Whether the outliner editor owns the clipboard for this event.
 *
 * Copy/cut listeners are registered on `document` (capture phase), so they also
 * observe clipboard events that belong to other parts of the page: a comment
 * input, the search box, a dialog, or a plain text selection made outside the
 * tree. In those cases a stale item selection may still be present in the
 * store, which used to make Ctrl+C copy item content instead of what the user
 * actually selected. Only handle the event while the editor input surface (the
 * global textarea) or an element inside the outliner has focus; otherwise let
 * the browser perform its default clipboard behavior.
 */
export function isEditorClipboardEvent(event: Event): boolean {
    if (typeof document === "undefined") return false;
    const target = (event.composedPath && event.composedPath().length > 0)
        ? (event.composedPath()[0] as EventTarget)
        : event.target;
    if (isForeignInput(target) || isForeignInput(document.activeElement)) return false;

    const active = document.activeElement as HTMLElement | null;
    if (!active) return false;
    if (active.classList?.contains("global-textarea")) return true;
    return !!active.closest?.(".outliner, .tree-container");
}

/**
 * Handler that distributes key and input events to each cursor instance
 */
export class KeyEventHandler {
    // Browsers may strip non-standard MIME entries while moving a ClipboardEvent
    // through the operating-system clipboard. Retain the last in-app payload as
    // a same-tab fallback, but only use it when its plain text still matches.
    private static lastStructuredClipboard: { encoded: string; plainText: string; } | undefined;
    /** Keydown carries Shift, while the subsequent ClipboardEvent does not. */
    private static nextPasteIsSpecial = false;

    // Maintains the state of box selection
    private static boxSelectionState: {
        active: boolean;
        startItemId: string | null;
        startOffset: number;
        endItemId: string | null;
        endOffset: number;
        ranges: Array<{
            itemId: string;
            startOffset: number;
            endOffset: number;
        }>;
    } = {
        active: false,
        startItemId: null,
        startOffset: 0,
        endItemId: null,
        endOffset: 0,
        ranges: [],
    };

    private static keyHandlers = new CustomKeyMap<
        { key: string; ctrl: boolean; alt: boolean; shift: boolean; },
        (event: KeyboardEvent, cursors: ReturnType<typeof store.getLocalCursorInstances>) => void
    >();

    private static initKeyHandlers() {
        if (KeyEventHandler.keyHandlers.size > 0) return;

        const map = KeyEventHandler.keyHandlers;

        const add = (
            key: string,
            ctrl: boolean,
            alt: boolean,
            shift: boolean,
            handler: (event: KeyboardEvent, cursors: ReturnType<typeof store.getLocalCursorInstances>) => void,
        ) => {
            map.set({ key, ctrl, alt, shift }, handler);
        };

        // Esc cancels box selection or closes alias picker
        add("Escape", false, false, false, () => {
            // If the alias picker is visible, close it
            if (aliasPickerStore.isVisible) {
                aliasPickerStore.hide();
                return;
            }

            const selections = Object.values(store.selections);
            const boxSelection = selections.find(sel => sel.isBoxSelection);
            if (boxSelection || KeyEventHandler.boxSelectionState.active) {
                KeyEventHandler.cancelBoxSelection();
                return;
            }

            // Deactivate edit mode and blur global textarea
            if (store.getActiveItem()) {
                store.setActiveItem(null);
                store.getTextareaRef()?.blur();
            }
        });

        // Alt+Shift+Arrow for box selection
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].forEach(k => {
            add(k, false, true, true, event => {
                KeyEventHandler.handleBoxSelection(event);
            });
        });

        // Ctrl+Shift+Alt+Arrow/PageUp/PageDown adds cursors
        ["ArrowDown", "PageDown"].forEach(k => {
            add(k, true, true, true, () => {
                store.addCursorRelativeToActive("down");
            });
        });
        ["ArrowUp", "PageUp"].forEach(k => {
            add(k, true, true, true, () => {
                store.addCursorRelativeToActive("up");
            });
        });

        // Ctrl+Z history undo
        add("z", true, false, false, () => {
            globalUndoRouter.undo();
        });

        // Ctrl+Shift+Z history redo
        add("z", true, false, true, () => {
            globalUndoRouter.redo();
        });

        // Ctrl+Y history redo
        add("y", true, false, false, () => {
            globalUndoRouter.redo();
        });

        // Alt+PageUp/PageDown scroll
        add("PageUp", false, true, false, (_, cursors) => {
            cursors.forEach(c => c.altPageUp());
        });
        add("PageDown", false, true, false, (_, cursors) => {
            cursors.forEach(c => c.altPageDown());
        });

        // Formatting shortcuts
        add("b", true, false, false, (_, cursors) => {
            cursors.forEach(c => c.formatBold());
        });
        add("i", true, false, false, (_, cursors) => {
            cursors.forEach(c => c.formatItalic());
        });
        add("u", true, false, false, (_, cursors) => {
            cursors.forEach(c => c.formatUnderline());
        });
        add("k", true, false, false, (_, cursors) => {
            cursors.forEach(c => c.formatStrikethrough());
        });
        add("`", true, false, false, (_, cursors) => {
            cursors.forEach(c => c.formatCode());
        });

        // Ctrl+X cut
        add("x", true, false, false, () => {
            // Manually trigger the cut event
            const clipboardEvent = new ClipboardEvent("cut", {
                clipboardData: new DataTransfer(),
                bubbles: true,
                cancelable: true,
            });

            // Dispatch the cut event
            document.dispatchEvent(clipboardEvent);
        });

        // Ctrl+C copy fallback
        add("c", true, false, false, () => {
            KeyEventHandler._nativeCopyFired = false;
            // Check if store has local selection
            const localSelection = Object.values(store.selections).find(s => (s.userId || "local") === "local");
            if (!localSelection) return;

            // Give the browser native copy a chance to fire.
            // If it hasn't fired in the same loop, we fire a synthetic one
            setTimeout(() => {
                if (KeyEventHandler._nativeCopyFired) return;
                const structured = selectedItemsClipboardData();
                // A component host contributes its view name to the structured
                // payload only, so the structured plain text is authoritative
                // whenever the selection carries one.
                const selectedText = structured?.plainText || store.getSelectedText("local");
                if (selectedText) {
                    if (typeof window !== "undefined") {
                        (window as typeof window & { lastCopiedText?: string; }).lastCopiedText = selectedText;
                        if (structured) {
                            (window as typeof window & {
                                lastCopiedStructuredItems?: { encoded: string; plainText: string; };
                            }).lastCopiedStructuredItems = structured;
                        }
                    }

                    // Write to OS clipboard as fallback because synthetic event cannot reach OS
                    if (!structured && typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
                        navigator.clipboard.writeText(selectedText).catch((err: unknown) => {
                            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                                logger.error(
                                    { error: err },
                                    "navigator.clipboard.writeText failed in synthetic Ctrl+C fallback:",
                                );
                            }
                        });
                    }

                    // Trigger the synthetic event for internal logic. It must be
                    // dispatched on the global textarea because KeyEventHandler.handleCopy
                    // — the only handler that writes the structured component payload — is
                    // bound to that element; document listeners still see it while bubbling.
                    const clipboardEvent = new ClipboardEvent("copy", {
                        clipboardData: new DataTransfer(),
                        bubbles: true,
                        cancelable: true,
                    });
                    (store.getTextareaRef() ?? document).dispatchEvent(clipboardEvent);
                }
            }, 0);
        });
    }
    /**
     * Delegate KeyDown events to each cursor
     */
    static handleKeyDown(event: KeyboardEvent) {
        // Generally ignore events already handled by other handlers. However, continue for Enter/Arrow/Escape while palette is visible.
        if ((event as KeyboardEvent).defaultPrevented) {
            if (!commandPaletteStore.isVisible) return;
        }
        if (isForeignInput(event.target) || isForeignInput(document.activeElement)) return;
        const k = (event as KeyboardEvent).key;

        // Command Palette Interaction
        if (commandPaletteStore.isVisible) {
            if (!event.ctrlKey && !event.metaKey && !event.altKey && k.length === 1 && k !== "/") {
                commandPaletteStore.handleCommandInput(k);
                event.preventDefault();
                return;
            }
            if (k === "Backspace") {
                commandPaletteStore.handleCommandBackspace();
                event.preventDefault();
                return;
            }
            if (k === "Enter") {
                const list = commandPaletteStore.visible ?? [];
                const sel = list?.[commandPaletteStore.selectedIndex ?? 0];
                const q = String(commandPaletteStore.query || "").toLowerCase();
                const isAliasOnly = Array.isArray(list) && list.length === 1 && (list[0]?.type === "alias");
                const looksAlias = q === "alias" || /^(?:al|ali|alia|alias)$/.test(q);

                let textSaysAlias = false;
                try {
                    const w = typeof window !== "undefined"
                        ? window as Window & typeof globalThis & {
                            appStore?: { textareaRef?: HTMLTextAreaElement; };
                            generalStore?: { textareaRef?: HTMLTextAreaElement; };
                        }
                        : undefined;
                    const gs = w?.appStore || w?.generalStore;
                    const ta: HTMLTextAreaElement | null | undefined = gs?.textareaRef;
                    if (ta && typeof ta.value === "string") {
                        const before = ta.value.slice(
                            0,
                            typeof ta.selectionStart === "number" ? ta.selectionStart : ta.value.length,
                        );
                        textSaysAlias = /\/(?:al|ali|alia|alias)$/i.test(before);
                    }
                } catch (_e) {
                    logger.error(_e);
                }

                if (isAliasOnly || looksAlias || textSaysAlias) {
                    try {
                        if (typeof window !== "undefined" && window.DEBUG_MODE) {
                            logger.debug(
                                "KeyEventHandler: palette Enter forcing alias insert (q=",
                                q,
                                ", textSaysAlias=",
                                textSaysAlias,
                                ")",
                            );
                        }
                    } catch (_e) {
                        logger.error(_e);
                    }
                    commandPaletteStore.insert("alias");
                    commandPaletteStore.hide();
                    event.preventDefault();
                    return;
                }
                // Otherwise normal confirmation
                if (sel) {
                    commandPaletteStore.confirm();
                    event.preventDefault();
                    return;
                }

                commandPaletteStore.confirm();
                event.preventDefault();
                return;
            }
            if (k === "ArrowDown") {
                commandPaletteStore.move(1);
                event.preventDefault();
                return;
            }
            if (k === "ArrowUp") {
                commandPaletteStore.move(-1);
                event.preventDefault();
                return;
            }
        }

        // Palette Activation via Slash
        if (k === "/") {
            // Context verification: prevent opening immediately after [ or inside internal links
            let shouldShow = true;
            try {
                const cursors = store.getLocalCursorInstances();
                if (cursors.length > 0) {
                    const cursor = cursors[0];
                    const node = cursor.findTarget();
                    const text = String(node?.text || "");
                    const prevChar = cursor.offset > 0 ? text[cursor.offset - 1] : "";

                    if (prevChar === "[") {
                        shouldShow = false;
                    } else {
                        const beforeCursor = text.slice(0, cursor.offset);
                        const lastOpenBracket = beforeCursor.lastIndexOf("[");
                        const lastCloseBracket = beforeCursor.lastIndexOf("]");
                        if (lastOpenBracket > lastCloseBracket) {
                            shouldShow = false;
                        }
                    }
                }
            } catch (_e) {
                logger.error(_e);
            }

            if (shouldShow && !commandPaletteStore.isVisible) {
                try {
                    const pos = commandPaletteStore.getCursorScreenPosition();
                    commandPaletteStore.show(pos || { top: 0, left: 0 }, false);
                } catch (_e) {
                    logger.error(_e);
                }
            }
        }

        const cursorInstances = store.getLocalCursorInstances();

        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "v") {
            KeyEventHandler.nextPasteIsSpecial = true;
        }

        // Debug info
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(
                `KeyEventHandler.handleKeyDown called with key=${event.key}, ctrlKey=${event.ctrlKey}, shiftKey=${event.shiftKey}, altKey=${event.altKey}`,
            );
        }
        const target = event.target as Element | null;
        const tgt = target?.tagName || typeof target?.nodeName === "string"
            ? target.nodeName
            : typeof event.target;

        const activeElement = document.activeElement as Element | null;
        const ae = activeElement?.tagName
                || typeof activeElement?.nodeName === "string"
            ? activeElement.nodeName
            : typeof document.activeElement;
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(`KeyEventHandler.handleKeyDown: target=${tgt}, active=${ae}`);
        }
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(`Current cursor instances: ${cursorInstances.length}`);
        }

        // Pre-evaluate if "/alias" trigger exists on Enter (flag to open picker after subsequent default processing)
        let shouldOpenAliasPickerAfterDefault = false;
        let earlyBeforeForLog: string | null = null;
        if (event.key === "Enter" && cursorInstances.length > 0) {
            const cursor = cursorInstances[0];
            const node = cursor.findTarget();

            const rawText = (node as { text?: unknown; })?.text;
            const text: string = typeof rawText === "string"
                ? rawText
                : ((rawText as { toString?: () => string; })?.toString?.() ?? "");
            const before = text.slice(0, cursor.offset);
            earlyBeforeForLog = before;
            const lastSlash = before.lastIndexOf("/");
            const cmd = lastSlash >= 0 ? before.slice(lastSlash + 1) : "";

            const gsAny: unknown = typeof window !== "undefined"
                ? (window as Window & typeof globalThis & { appStore?: unknown; generalStore?: unknown; })
                : null;
            const gs = (gsAny as { appStore?: unknown; generalStore?: unknown; })?.appStore
                || (gsAny as { appStore?: unknown; generalStore?: unknown; })?.generalStore;
            const ta: HTMLTextAreaElement | undefined = (gs as { textareaRef?: HTMLTextAreaElement; })?.textareaRef;
            const taValue: string | null = ta?.value ?? null;
            const caretPos: number = typeof ta?.selectionStart === "number" ? ta!.selectionStart : cursor.offset;
            const source = typeof taValue === "string" ? taValue : text;
            const srcBefore = source.slice(0, caretPos);
            const srcLastSlash = srcBefore.lastIndexOf("/");
            const srcCmd = srcLastSlash >= 0 ? srcBefore.slice(srcLastSlash + 1) : "";

            const aliasDetected = /\/alias$/i.test(srcBefore) || /(^|[^a-zA-Z])alias$/i.test(before)
                || /^alias$/i.test(cmd) || /^alias$/i.test(srcCmd);
            try {
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(
                        "KeyEventHandler Early Enter check: before=",
                        before,
                        " cmd=",
                        cmd,
                        " paletteVisible=",
                        commandPaletteStore.isVisible,
                    );
                }
            } catch (_e) {
                logger.error(_e);
            }
            try {
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(
                        "KeyEventHandler Early aliasDetected=",
                        aliasDetected,
                        " srcBefore=",
                        srcBefore,
                        " before=",
                        before,
                        " srcCmd=",
                        srcCmd,
                        " cmd=",
                        cmd,
                    );
                }
            } catch (_e) {
                logger.error(_e);
            }
            if (aliasDetected) {
                shouldOpenAliasPickerAfterDefault = true;
            }
        }

        // Pre-processing: Ensure command palette displays on slash input
        if (event.key === "/") {
            try {
                let preventPalette = false;
                if (cursorInstances.length > 0) {
                    const cursor = cursorInstances[0];
                    const node = cursor.findTarget();
                    const text = String(node?.text || "");
                    const prevChar = cursor.offset > 0 ? text[cursor.offset - 1] : "";

                    // Do not show palette immediately after internal link start ([/) or within [ ... ]
                    if (prevChar === "[") {
                        preventPalette = true;
                    } else {
                        const beforeCursor = text.slice(0, cursor.offset);
                        const lastOpenBracket = beforeCursor.lastIndexOf("[");
                        const lastCloseBracket = beforeCursor.lastIndexOf("]");
                        if (lastOpenBracket > lastCloseBracket) {
                            preventPalette = true; // Inside internal link
                        }
                    }
                }

                if (!preventPalette) {
                    const pos = commandPaletteStore.getCursorScreenPosition();
                    commandPaletteStore.show(pos || { top: 0, left: 0 }, false);
                    // Let Slash input process normally (query accumulates in subsequent Input)
                }
            } catch (e) {
                // Continue normal input even if failed
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.warn("Slash pre-show failed:", e);
                }
            }
        }

        if (commandPaletteStore.isVisible) {
            if (event.key === " ") {
                if (commandPaletteStore.query === "") {
                    // Hide palette if space is entered immediately after / (e.g. [/ ] for italics)
                    commandPaletteStore.hide();
                    // DO NOT call preventDefault here. We want the browser to naturally insert the space.
                    return;
                }
            } else if (event.key === "ArrowDown") {
                commandPaletteStore.move(1);
                event.preventDefault();
                return;
            } else if (event.key === "ArrowUp") {
                commandPaletteStore.move(-1);
                event.preventDefault();
                return;
            } else if (event.key === "Enter") {
                // Palette Visible: Always prioritize Alias if filter includes Alias
                try {
                    const filtered = commandPaletteStore.visible ?? [];
                    const hasAlias = filtered.some(c => c?.type === "alias");
                    if (hasAlias) {
                        try {
                            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                                logger.debug(
                                    "KeyEventHandler Palette Enter: forcing alias insert based on filtered results",
                                );
                            }
                        } catch (_e) {
                            logger.error(_e);
                        }
                        commandPaletteStore.insert("alias");
                        commandPaletteStore.hide();
                        event.preventDefault();
                        return;
                    }
                } catch (_e) {
                    logger.error(_e);
                }

                // Directly handle if text immediately preceding is "/alias"
                try {
                    const cursor = cursorInstances[0];
                    const node = cursor.findTarget();
                    const text = String(node?.text || "");
                    const before = text.slice(0, cursor.offset);
                    const lastSlash = before.lastIndexOf("/");
                    const cmd = lastSlash >= 0 ? before.slice(lastSlash + 1) : "";
                    try {
                        if (typeof window !== "undefined" && window.DEBUG_MODE) {
                            logger.debug("KeyEventHandler Palette Enter: before=", before, " cmd=", cmd);
                        }
                    } catch (_e) {
                        logger.error(_e);
                    }
                    if (/^alias$/i.test(cmd)) {
                        commandPaletteStore.hide();
                        // Remove command string
                        const newText = text.slice(0, lastSlash) + text.slice(cursor.offset);
                        node?.updateText(newText);
                        cursor.offset = lastSlash;
                        cursor.applyToStore();

                        // Add new item next to the current one and show AliasPicker
                        const userId = cursor.userId || "local";
                        const newItem = insertItemAfterTargetOrAppend(node, userId);

                        if (newItem) {
                            newItem.text = "";
                            newItem.aliasTargetId = undefined;
                            try {
                                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                                    logger.debug(
                                        "KeyEventHandler(Palette): showing AliasPicker for",
                                        newItem.id,
                                    );
                                }
                            } catch (_e) {
                                logger.error(_e);
                            }
                            {
                                const w = typeof window !== "undefined"
                                    ? (window as Window & typeof globalThis & {
                                        aliasPickerStore?: typeof aliasPickerStore;
                                    })
                                    : null;
                                (w?.aliasPickerStore ?? aliasPickerStore).show(
                                    newItem.id,
                                );
                            }
                            // Move cursor
                            store.clearCursorAndSelection(userId);
                            cursor.itemId = newItem.id;
                            cursor.offset = 0;
                            store.setActiveItem(newItem.id);
                            cursor.applyToStore();
                            store.startCursorBlink();

                            event.preventDefault();
                            return;
                        }
                    }
                } catch (e) {
                    // Fallback to confirm if fallback fails
                    try {
                        logger.warn("KeyEventHandler Palette Enter alias handling failed:", e);
                    } catch (_e) {
                        logger.error(_e);
                    }
                }
                // Normal palette confirm
                commandPaletteStore.confirm();
                event.preventDefault();
                return;
            } else if (event.key === "Escape") {
                commandPaletteStore.hide();
                event.preventDefault();
                return;
            } else if (event.key === "Backspace") {
                commandPaletteStore.handleCommandBackspace();
                event.preventDefault();
                return;
            }
        }

        // Do not process if no cursor
        if (cursorInstances.length === 0) {
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(`No cursor instances found, skipping key event`);
                }
            }
            return;
        }

        // Auxiliary: Support alias creation with Enter immediately after "/alias" when palette is hidden
        if (event.key === "Enter" && !commandPaletteStore.isVisible) {
            try {
                const cursor = cursorInstances[0];
                const node = cursor.findTarget();
                const text = String(node?.text || "");
                const before = text.slice(0, cursor.offset);
                const lastSlash = before.lastIndexOf("/");
                const cmd = lastSlash >= 0 ? before.slice(lastSlash + 1) : "";

                const w = typeof window !== "undefined"
                    ? (window as Window & typeof globalThis & {
                        appStore?: { textareaRef?: HTMLTextAreaElement | null; };
                        generalStore?: { textareaRef?: HTMLTextAreaElement | null; };
                    })
                    : undefined;
                const gs = w?.appStore || w?.generalStore;
                const ta: HTMLTextAreaElement | null | undefined = gs?.textareaRef;
                const taValue: string | null = ta?.value ?? null;
                const caretPos: number = typeof ta?.selectionStart === "number" ? ta!.selectionStart : cursor.offset;
                const source = typeof taValue === "string" ? taValue : text;
                const srcBefore = source.slice(0, caretPos);
                const srcLastSlash = srcBefore.lastIndexOf("/");
                const srcCmd = srcLastSlash >= 0 ? srcBefore.slice(srcLastSlash + 1) : "";
                const aliasDetected = /\/alias$/i.test(srcBefore) || /(^|[^a-zA-Z])alias$/i.test(before)
                    || /^alias$/i.test(cmd) || /^alias$/i.test(srcCmd);
                try {
                    if (typeof window !== "undefined" && window.DEBUG_MODE) {
                        logger.debug(
                            "KeyEventHandler Enter fallback: before=",
                            before,
                            " cmd=",
                            cmd,
                            " srcBefore=",
                            srcBefore,
                            " srcCmd=",
                            srcCmd,
                        );
                    }
                } catch (_e) {
                    logger.error(_e);
                }

                if (aliasDetected) {
                    // NOTE: Skipping '/alias' text removal as it is not mandatory (E2E verifies picker display)

                    // Add new item to end

                    const items = (gs as {
                        currentPage?: {
                            items?: {
                                addNode: (userId: string, prevLen?: number) => unknown;
                                length: number;
                                at: (index: number) => unknown;
                                [key: number]: unknown;
                            };
                        };
                    })?.currentPage?.items;
                    if (items && typeof items.addNode === "function") {
                        const userId = cursor.userId || "local";
                        let newItem: unknown = null;
                        try {
                            newItem = items.addNode(userId);
                        } catch {
                            try {
                                const prevLen = typeof items.length === "number" ? items.length : 0;
                                newItem = items.addNode(userId, prevLen);
                            } catch (_e) {
                                logger.error(_e);
                            }
                        }

                        // Fallback
                        if (!newItem) {
                            const lastIndex = (items.length ?? 0) - 1;
                            newItem = items.at ? items.at(lastIndex) : items[lastIndex];
                        }

                        if (newItem) {
                            (newItem as { text?: string; }).text = "";

                            (newItem as { aliasTargetId?: string; }).aliasTargetId = undefined;
                            try {
                                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                                    logger.debug(
                                        "KeyEventHandler: showing AliasPicker for",
                                        (newItem as { id: string; }).id,
                                    );
                                }
                            } catch (_e) {
                                logger.error(_e);
                            }
                            {
                                const w: unknown = typeof window !== "undefined"
                                    ? (window as Window & typeof globalThis & { [key: string]: unknown; })
                                    : null;

                                ((w as { aliasPickerStore?: typeof aliasPickerStore; })?.aliasPickerStore
                                    ?? aliasPickerStore).show((newItem as { id: string; }).id);
                            }
                            // Move cursor
                            store.clearCursorAndSelection(userId);

                            cursor.itemId = (newItem as { id: string; }).id;
                            cursor.offset = 0;

                            store.setActiveItem((newItem as { id: string; }).id);
                            cursor.applyToStore();
                            store.startCursorBlink();

                            event.preventDefault();
                            event.stopPropagation();
                            return; // Complete process here
                        }
                    }
                }
            } catch (e) {
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.warn("Enter alias fallback failed:", e);
                }
            }
        }

        KeyEventHandler.initKeyHandlers();
        const keyCombo = {
            key: event.key,
            ctrl: event.ctrlKey,
            alt: event.altKey,
            shift: event.shiftKey,
        };
        const handler = KeyEventHandler.keyHandlers.get(keyCombo);

        // Debug info
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(`Looking for handler with key combo:`, keyCombo);
            }
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(`Handler found: ${handler !== undefined}`);
            }
        }

        if (handler) {
            handler(event, cursorInstances);

            // Since Enter's normal processing (newline/new item addition etc.) should be complete here,
            // open AliasPicker afterwards based on pre-detection flag
            if (shouldOpenAliasPickerAfterDefault) {
                try {
                    setTimeout(() => {
                        try {
                            const w: unknown = typeof window !== "undefined"
                                ? (window as Window & typeof globalThis & { [key: string]: unknown; })
                                : null;
                            const tryOpen = (attempt = 0) => {
                                try {
                                    const activeId = store.getActiveItem?.();
                                    if (activeId) {
                                        (((w as unknown as { aliasPickerStore?: typeof aliasPickerStore; })
                                            ?.aliasPickerStore) ?? aliasPickerStore).show(activeId);
                                        try {
                                            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                                                logger.debug(
                                                    "KeyEventHandler(Post): showing AliasPicker for activeId",
                                                    activeId,
                                                    " after default handler. before=",
                                                    earlyBeforeForLog,
                                                );
                                            }
                                        } catch (_e) {
                                            logger.error(_e);
                                        }
                                        return;
                                    }
                                    if (attempt < 10) {
                                        setTimeout(() => tryOpen(attempt + 1), 10);
                                    } else {
                                        logger.warn(
                                            "KeyEventHandler(Post): active item not found to open AliasPicker",
                                        );
                                    }
                                } catch (e) {
                                    logger.warn(
                                        "KeyEventHandler(Post): error while trying to open AliasPicker via active item",
                                        e,
                                    );
                                }
                            };
                            tryOpen(0);
                        } catch (e) {
                            logger.warn(
                                "KeyEventHandler(Post): failed to schedule AliasPicker open after default handler",
                                e,
                            );
                        }
                    }, 0);
                } catch (_e) {
                    logger.error(_e);
                }
            }

            event.preventDefault();
            event.stopPropagation();
            return;
        }

        // Call onKeyDown method for each cursor instance
        let handled = false;

        // For Ctrl/Cmd+A (Select All), handle it only once for the first cursor
        // to prevent overlapping multiple cursors duplicating the exact same page-wide selection and
        // leaving multiple overlapping cursors trapped at the end of the document.
        if (
            (event.ctrlKey || event.metaKey) && (event.key === "a" || event.key === "A") && cursorInstances.length > 0
        ) {
            if (cursorInstances[0].onKeyDown(event)) {
                handled = true;
            }
        } else {
            for (const cursor of cursorInstances) {
                if (cursor.onKeyDown(event)) {
                    handled = true;
                }
            }
        }

        // If at least one cursor handled the event
        if (handled) {
            event.preventDefault();
            event.stopPropagation();

            // Ensure focus on global textarea
            const globalTextarea = store.getTextareaRef();
            if (globalTextarea) {
                // Multiple attempts to ensure focus is set
                globalTextarea.focus();

                // Set focus using requestAnimationFrame
                requestAnimationFrame(() => {
                    globalTextarea.focus();
                });
            }

            // Post-processing to open AliasPicker after normal processing (cursor.onKeyDown etc.)
            if (shouldOpenAliasPickerAfterDefault) {
                try {
                    setTimeout(() => {
                        try {
                            const w: unknown = typeof window !== "undefined"
                                ? (window as Window & typeof globalThis & { [key: string]: unknown; })
                                : null;
                            const tryOpen = (attempt = 0) => {
                                try {
                                    const activeId = store.getActiveItem?.();
                                    if (activeId) {
                                        (((w as unknown as { aliasPickerStore?: typeof aliasPickerStore; })
                                            ?.aliasPickerStore) ?? aliasPickerStore).show(activeId);
                                        try {
                                            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                                                logger.debug(
                                                    "KeyEventHandler(Post2): showing AliasPicker for activeId",
                                                    activeId,
                                                );
                                            }
                                        } catch (_e) {
                                            logger.error(_e);
                                        }
                                        return;
                                    }
                                    if (attempt < 10) {
                                        setTimeout(() => tryOpen(attempt + 1), 10);
                                    } else {
                                        logger.warn(
                                            "KeyEventHandler(Post2): active item not found to open AliasPicker",
                                        );
                                    }
                                } catch (e) {
                                    logger.warn(
                                        "KeyEventHandler(Post2): error while trying to open AliasPicker via active item",
                                        e,
                                    );
                                }
                            };
                            tryOpen(0);
                        } catch (e) {
                            logger.warn(
                                "KeyEventHandler(Post2): failed to schedule AliasPicker open after cursor.onKeyDown",
                                e,
                            );
                        }
                    }, 0);
                } catch (_e) {
                    logger.error(_e);
                }
            }
        }

        // Debug info
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug(`Key event handled: ${handled}`);
            if (handled) {
                // Output cursor state to log
                store.logCursorState();
            }
        }
    }

    /**
     * Delegate Input events to each cursor
     */
    static handleBeforeInput(event: Event) {
        if (isForeignInput(event.target) || isForeignInput(document.activeElement)) return;
        const inputEvent = event as InputEvent;
        if (inputEvent.isComposing || inputEvent.inputType?.startsWith("insertComposition")) return;
        const cursorInstances = store.getLocalCursorInstances();
        cursorInstances.forEach(cursor => {
            if (
                typeof (cursor as unknown as { onBeforeInput?: (e: InputEvent) => void; }).onBeforeInput === "function"
            ) {
                (cursor as unknown as { onBeforeInput: (e: InputEvent) => void; }).onBeforeInput(inputEvent);
            }
        });
    }

    static handleInput(event: Event) {
        if (isForeignInput(event.target) || isForeignInput(document.activeElement)) return;

        const inputEvent = event as InputEvent;

        // Ignore input events while Alias Picker is visible
        try {
            if (aliasPickerStore.isVisible) return;
        } catch (_e) {
            logger.error(_e);
        }

        // Debug info
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(
                `KeyEventHandler.handleInput called with inputType=${inputEvent.inputType}, isComposing=${inputEvent.isComposing}`,
            );
        }
        if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug(`Input data: "${inputEvent.data}"`);
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(`Current active element: ${document.activeElement?.tagName}`);
        }

        // Ignore input during IME composition to avoid duplicate processing
        if (inputEvent.isComposing || inputEvent.inputType.startsWith("insertComposition")) {
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(`Skipping input event during composition`);
                }
            }
            return;
        }

        if (inputEvent.inputType === "historyUndo") {
            globalUndoRouter.undo();
            inputEvent.preventDefault?.();
            return;
        }

        if (inputEvent.inputType === "historyRedo") {
            globalUndoRouter.redo();
            inputEvent.preventDefault?.();
            return;
        }

        // Get cursor instances from the store
        const cursorInstances = store.getLocalCursorInstances();

        if (inputEvent.data === "/") {
            // Check character before cursor position to determine if it's part of an internal link
            if (cursorInstances.length > 0) {
                const cursor = cursorInstances[0];
                const node = cursor.findTarget();
                const rawText: unknown = node?.text;
                const text: string = typeof rawText === "string" ? rawText : (rawText?.toString?.() ?? "");
                const prevChar = cursor.offset > 0 ? text[cursor.offset - 1] : "";

                // Do not show command palette if immediately after [ or already inside internal link starting with [
                if (prevChar === "[") {
                    // Continue normal input processing
                } else {
                    // Check if inside internal link starting with [
                    const beforeCursor = text.slice(0, cursor.offset);
                    const lastOpenBracket = beforeCursor.lastIndexOf("[");
                    const lastCloseBracket = beforeCursor.lastIndexOf("]");

                    // If last [ is after last ], it's inside an internal link
                    if (lastOpenBracket > lastCloseBracket) {
                        // Continue normal input processing
                    } else {
                        // Show command palette.
                        // The slash has not been applied to the model yet (cursor.onInput runs
                        // later in this handler), so the cursor offset is still the pre-insert
                        // one and marks exactly where the slash will land: isPostInsert = false.
                        // Always re-record it, even when the palette already looks visible:
                        // handleKeyDown may not have run at all (virtual keyboards and
                        // programmatic input fire only `input`), and a palette left open on
                        // another item would otherwise keep offsets that do not belong to this
                        // slash. When handleKeyDown did run it recorded the same values, so
                        // re-showing is a no-op.
                        const pos = commandPaletteStore.getCursorScreenPosition();
                        commandPaletteStore.show(pos || { top: 0, left: 0 }, false);
                    }
                }
            } else {
                // Show command palette if no cursor
                const pos = commandPaletteStore.getCursorScreenPosition();
                commandPaletteStore.show(pos || { top: 0, left: 0 }, false);
            }
        } else if (inputEvent.data === "[" && commandPaletteStore.isVisible) {
            // Hide command palette if [ is entered (start of internal link)
            commandPaletteStore.hide();
        } else if (commandPaletteStore.isVisible) {
            if (inputEvent.data === " " && commandPaletteStore.query === "") {
                // Hide command palette if space is entered immediately after / (e.g. [/ ] for italics)
                commandPaletteStore.hide();
                // We MUST let the space go through to Svelte via natural event propagation, but Playwright's `type`
                // sometimes races with the focus loss when the palette is removed. We use standard execution paths.
                return;
            } else if (inputEvent.data && inputEvent.data.length > 0) {
                // Use dedicated input processing if CommandPalette is visible
                commandPaletteStore.handleCommandInput(inputEvent.data);
                // Skip normal input processing
                inputEvent.preventDefault?.();
                return;
            }
        }

        // Do not process if no cursor
        if (cursorInstances.length === 0) {
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(`No cursor instances found, skipping input event`);
                }
            }
            return;
        }

        // Debug info
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(`Applying input to ${cursorInstances.length} cursor instances`);
            }
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(`Current cursors:`, Object.values(store.cursors));
            }
        }

        // Apply input to each cursor
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(`Applying input to ${cursorInstances.length} cursor instances`);
        }
        cursorInstances.forEach((cursor, index) => {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(`Applying input to cursor ${index}: itemId=${cursor.itemId}, offset=${cursor.offset}`);
            }
            cursor.onInput(inputEvent);
        });

        // Call onEdit callback
        store.triggerOnEdit();
        if (cursorInstances.length > 0) {
            const firstCursor = cursorInstances[0];
            const node = firstCursor.findTarget();
            const textareaElement = store.getTextareaRef();
            if (textareaElement && node && typeof node.text !== "undefined") {
                if (!store.isComposing) {
                    textareaElement.value = node.text.toString();

                    store.suppressSelectionResync = true;
                    store.applyTextareaSelectionRange(textareaElement, firstCursor.offset, firstCursor.offset);
                    queueMicrotask(() => {
                        store.suppressSelectionResync = false;
                    });
                }
            }
        }

        // Ensure focus on global textarea
        const textareaElement = store.getTextareaRef();
        if (textareaElement) {
            // Multiple attempts to ensure focus is set
            textareaElement.focus();

            // Set focus using requestAnimationFrame
            requestAnimationFrame(() => {
                textareaElement.focus();

                // Also use setTimeout to be more certain
                setTimeout(() => {
                    textareaElement.focus();

                    // Debug info
                    if (
                        typeof window !== "undefined"
                        && typeof document !== "undefined"
                        && window.DEBUG_MODE
                    ) {
                        if (typeof window !== "undefined" && window.DEBUG_MODE) {
                            logger.debug(
                                `Focus set after input. Active element is textarea: ${
                                    document.activeElement === textareaElement
                                }`,
                            );
                        }
                    }
                }, 10);
            });
        } else {
            // Log error if textarea not found
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                logger.warn(
                    { message: `Global textarea not found in handleInput` },
                    "Global textarea not found in handleInput",
                );
            }
        }

        // Start cursor blinking
        store.startCursorBlink();

        // Output cursor state to log
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            store.logCursorState();
        }

        // Check current value of textarea
        const textareaRef = store.getTextareaRef();
        if (textareaRef) {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(`Textarea value: "${textareaRef.value}"`);
            }
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(
                    `Textarea selection: start=${textareaRef.selectionStart}, end=${textareaRef.selectionEnd}`,
                );
            }
        } else {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(`Textarea not found in KeyEventHandler.handleInput`);
            }
        }

        // Check state of cursor instances
        const cursorInstancesAfter = store.getLocalCursorInstances();
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(`Number of cursor instances: ${cursorInstancesAfter.length}`);
        }
        cursorInstancesAfter.forEach((cursor, index) => {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(`Cursor ${index}: itemId=${cursor.itemId}, offset=${cursor.offset}`);
            }
        });
    }

    // Retain current composition length
    static lastCompositionLength = 0;

    /**
     * Process IME compositionstart event
     */
    static handleCompositionStart(_event: CompositionEvent) {
        KeyEventHandler.lastCompositionLength = 0;
        store.setCompositionLength(0);
    }
    /**
     * Process IME compositionupdate event and display intermediate input characters
     */
    static handleCompositionUpdate(event: CompositionEvent) {
        const data = event.data || "";
        const cursorInstances = store.getLocalCursorInstances();
        // Remove previous intermediate characters
        if (KeyEventHandler.lastCompositionLength > 0) {
            cursorInstances.forEach(cursor => {
                for (let i = 0; i < KeyEventHandler.lastCompositionLength; i++) {
                    cursor.deleteBackward();
                }
            });
        }
        // Insert new intermediate characters
        if (data.length > 0) {
            cursorInstances.forEach(cursor => cursor.insertText(data));
        }
        KeyEventHandler.lastCompositionLength = data.length;
        store.setCompositionLength(data.length);
    }

    /**
     * Process IME compositionend event and insert Japanese input
     */
    static handleCompositionEnd(event: CompositionEvent) {
        const data = event.data || "";
        const cursorInstances = store.getLocalCursorInstances();
        // Remove intermediate characters
        if (KeyEventHandler.lastCompositionLength > 0) {
            cursorInstances.forEach(cursor => {
                for (let i = 0; i < KeyEventHandler.lastCompositionLength; i++) {
                    cursor.deleteBackward();
                }
            });
        }
        // Insert confirmed characters
        if (data.length > 0) {
            cursorInstances.forEach(cursor => cursor.insertText(data));
        }
        KeyEventHandler.lastCompositionLength = 0;
        store.setCompositionLength(0);
    }

    /**
     * Process copy event
     * @param event ClipboardEvent
     */
    static _nativeCopyFired = false;
    static handleCopy(event: ClipboardEvent) {
        KeyEventHandler._nativeCopyFired = true;
        // Debug info
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug(`KeyEventHandler.handleCopy called`);
        }

        // Do nothing when the copy belongs to another input or to a plain page selection
        if (!isEditorClipboardEvent(event)) return;

        // Do nothing if no selection
        const selections = Object.values(store.selections);
        if (selections.length === 0) return;

        // Prevent browser default copy action
        event.preventDefault();

        // Check if box selection
        const boxSelection = selections.find(sel => sel.isBoxSelection);

        // Get text of selection range
        let selectedText: string;
        let isBoxSelectionCopy = false;
        const structured = selectedItemsClipboardData();

        if (boxSelection) {
            // If box selection
            selectedText = store.getSelectedText("local");
            isBoxSelectionCopy = true;

            // Debug info
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(`Box selection text: "${selectedText}"`);
                }
            }
        } else {
            // If normal selection range
            selectedText = store.getSelectedText("local");

            // Debug info
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(`Selected text from store: "${selectedText}"`);
                }
            }
        }

        if (structured) selectedText = structured.plainText;
        KeyEventHandler.lastStructuredClipboard = structured;
        if (structured?.truncated) {
            logger.warn("Grid export hit the clipboard size cap; the trimmed copy carries a notice.");
        }
        if (structured) writeStructuredSystemClipboard(structured);

        // If selection text could be obtained
        if (selectedText) {
            try {
                // Write to clipboard
                if (event.clipboardData) {
                    // Set plaintext
                    event.clipboardData.setData("text/plain", selectedText);
                    if (structured) event.clipboardData.setData(OUTLINER_ITEMS_MIME, structured.encoded);
                    if (structured) {
                        event.clipboardData.setData(
                            "text/html",
                            structuredClipboardHtml(structured.encoded, selectedText, structured.html),
                        );
                    }

                    // Add VS Code compatible metadata
                    if (isBoxSelectionCopy) {
                        try {
                            // VS Code box selection metadata format
                            const vscodeMetadata = {
                                isFromEmptySelection: false,
                                mode: "plaintext",
                                multicursorText: selectedText.split(/\r?\n/),
                                pasteMode: "spread",
                            };

                            // Convert metadata to JSON string
                            const metadataJson = JSON.stringify(vscodeMetadata);

                            // Set VS Code compatible metadata
                            event.clipboardData.setData("application/vscode-editor", metadataJson);

                            // Debug info
                            if (
                                typeof window !== "undefined"
                                && window.DEBUG_MODE
                            ) {
                                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                                    logger.debug(`VS Code metadata added:`, vscodeMetadata);
                                }
                            }
                        } catch (error) {
                            // Log if setting metadata fails
                            if (
                                typeof window !== "undefined"
                                && window.DEBUG_MODE
                            ) {
                                logger.error({ error }, "Failed to set VS Code metadata:");
                            }
                        }
                    }
                }

                // Save to global variable (E2E test environment only)
                // Not used in production, but needed to verify clipboard content in E2E tests
                if (typeof window !== "undefined") {
                    (window as Window & typeof globalThis & { [key: string]: unknown; }).lastCopiedText = selectedText;
                    (window as Window & typeof globalThis & { [key: string]: unknown; }).lastCopiedStructuredItems =
                        structured?.encoded;
                    (window as Window & typeof globalThis & { [key: string]: unknown; }).lastCopiedIsBoxSelection =
                        isBoxSelectionCopy;
                }

                // Write to navigator.clipboard for robust system clipboard access
                if (
                    typeof navigator !== "undefined"
                    && navigator?.clipboard?.writeText && !event.isTrusted && !structured
                ) {
                    navigator.clipboard.writeText(selectedText).catch((err: unknown) => {
                        if (
                            typeof window !== "undefined"
                            && window.DEBUG_MODE
                        ) {
                            logger.error({ error: err }, "navigator.clipboard.writeText failed in handleCopy:");
                        }
                    });
                }

                // Fallback: Copy using execCommand. Skipped for structured
                // payloads because it would replace the HTML flavour that
                // carries the component bindings with plain text.
                if (!event.isTrusted && !structured) {
                    // Selecting the helper element takes focus off the global textarea, and
                    // removing it leaves the document with no focused element at all. That
                    // tears down the software keyboard's editing session, so hand focus back.
                    const previouslyFocused = document.activeElement as HTMLElement | null;
                    const textarea = document.createElement("textarea");
                    textarea.value = selectedText;
                    textarea.style.position = "absolute";
                    textarea.style.left = "-9999px";
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand("copy");
                    document.body.removeChild(textarea);
                    previouslyFocused?.focus?.();
                }

                // Debug info
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    if (typeof window !== "undefined" && window.DEBUG_MODE) {
                        logger.debug(
                            `Clipboard updated with: "${selectedText}" (using navigator.clipboard & execCommand fallback)`,
                        );
                    }
                }
            } catch (error) {
                // Log if error occurs
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.error({ error }, "Error in handleCopy:");
                }
            }
            return;
        }
    }

    /**
     * Process box selection by Alt+Shift+Arrow keys
     * @param event KeyboardEvent
     */
    static handleBoxSelection(event: KeyboardEvent) {
        // Debug info
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(`KeyEventHandler.handleBoxSelection called with key=${event.key}`);
            }
        }

        // Get current cursor position
        const cursorInstances = store.getLocalCursorInstances();
        if (cursorInstances.length === 0) {
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(`No cursor instances found, skipping box selection`);
                }
            }
            return;
        }

        // Current active cursor
        const activeCursor = cursorInstances.find(c => c.isActive) || cursorInstances[0];
        if (!activeCursor || !activeCursor.itemId) {
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(`No active cursor or invalid cursor, skipping box selection`);
                }
            }
            return;
        }

        const activeItemId = activeCursor.itemId;
        const activeOffset = activeCursor.offset;

        // Start if box selection is not started
        if (!KeyEventHandler.boxSelectionState.active) {
            KeyEventHandler.boxSelectionState = {
                active: true,
                startItemId: activeItemId,
                startOffset: activeOffset,
                endItemId: activeItemId,
                endOffset: activeOffset,
                ranges: [{
                    itemId: activeItemId,
                    startOffset: activeOffset,
                    endOffset: activeOffset,
                }],
            };

            // Visual feedback - Flash effect on box selection start
            if (typeof window !== "undefined") {
                // Clear existing selections
                store.clearSelections();

                // Show cursor at start position
                store.setCursor({
                    itemId: activeItemId,
                    offset: activeOffset,
                    isActive: true,
                    userId: "local",
                });

                // Add style for visual feedback
                const styleEl = document.createElement("style");
                styleEl.id = "box-selection-feedback";
                styleEl.textContent = `
                    .cursor.active {
                        animation: box-selection-start-pulse 0.5s ease-out !important;
                    }
                    @keyframes box-selection-start-pulse {
                        0% { transform: scale(1); opacity: 1; }
                        50% { transform: scale(2); opacity: 0.7; }
                        100% { transform: scale(1); opacity: 1; }
                    }
                `;
                document.head.appendChild(styleEl);

                // Remove style after a certain time
                setTimeout(() => {
                    if (typeof document !== "undefined") {
                        const el = document.getElementById("box-selection-feedback");
                        if (el) el.remove();
                    }
                }, 500);
            }

            // Set initial state of box selection (display selection-box even at start)
            store.setBoxSelection(
                activeItemId,
                activeOffset,
                activeItemId,
                activeOffset,
                [{
                    itemId: activeItemId,
                    startOffset: activeOffset,
                    endOffset: activeOffset,
                }],
                "local",
            );

            // isUpdating flag is managed by EditorOverlayStore.setBoxSelection, so no DOM manipulation needed here

            // Debug info
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(`Box selection started at item=${activeItemId}, offset=${activeOffset}`);
                }
            }
        }

        // Update range of box selection
        let newEndOffset = KeyEventHandler.boxSelectionState.endOffset;
        let newEndItemId = KeyEventHandler.boxSelectionState.endItemId;

        // Update selection range according to arrow keys
        switch (event.key) {
            case "ArrowLeft": {
                if (KeyEventHandler.boxSelectionState.endOffset > 0) {
                    newEndOffset = KeyEventHandler.boxSelectionState.endOffset - 1;
                } else {
                    const prevItem = KeyEventHandler.getAdjacentItem(
                        KeyEventHandler.boxSelectionState.endItemId,
                        "prev",
                    );
                    if (prevItem) {
                        newEndItemId = prevItem.id;
                        newEndOffset = prevItem.text.length;
                    }
                }
                break;
            }
            case "ArrowRight": {
                // Get item text length
                const itemText = KeyEventHandler.getItemText(KeyEventHandler.boxSelectionState.endItemId);
                if (KeyEventHandler.boxSelectionState.endOffset < itemText.length) {
                    newEndOffset = KeyEventHandler.boxSelectionState.endOffset + 1;
                } else {
                    const nextItem = KeyEventHandler.getAdjacentItem(
                        KeyEventHandler.boxSelectionState.endItemId,
                        "next",
                    );
                    if (nextItem) {
                        newEndItemId = nextItem.id;
                        newEndOffset = 0;
                    }
                }
                break;
            }
            case "ArrowUp": {
                // Get item above
                const prevItem = KeyEventHandler.getAdjacentItem(KeyEventHandler.boxSelectionState.endItemId, "prev");
                if (prevItem) {
                    newEndItemId = prevItem.id;
                    // Maintain same horizontal position
                    newEndOffset = Math.min(prevItem.text.length, KeyEventHandler.boxSelectionState.endOffset);
                }
                break;
            }
            case "ArrowDown": {
                // Get item below
                const nextItem = KeyEventHandler.getAdjacentItem(KeyEventHandler.boxSelectionState.endItemId, "next");
                if (nextItem) {
                    newEndItemId = nextItem.id;
                    // Maintain same horizontal position
                    newEndOffset = Math.min(nextItem.text.length, KeyEventHandler.boxSelectionState.endOffset);
                }
                break;
            }
        }

        // Update end position
        KeyEventHandler.boxSelectionState.endOffset = newEndOffset;
        if (newEndItemId) {
            KeyEventHandler.boxSelectionState.endItemId = newEndItemId;
        }

        // Calculate box selection range
        KeyEventHandler.updateBoxSelectionRanges();

        // Set box selection
        if (
            KeyEventHandler.boxSelectionState.ranges.length > 0
            && KeyEventHandler.boxSelectionState.startItemId
            && KeyEventHandler.boxSelectionState.endItemId
        ) {
            try {
                store.setBoxSelection(
                    KeyEventHandler.boxSelectionState.startItemId,
                    KeyEventHandler.boxSelectionState.startOffset,
                    KeyEventHandler.boxSelectionState.endItemId,
                    KeyEventHandler.boxSelectionState.endOffset,
                    KeyEventHandler.boxSelectionState.ranges,
                    "local",
                );

                // isUpdating flag is managed by EditorOverlayStore.setBoxSelection, so no DOM manipulation needed here
                // Update cursor position
                store.setCursor({
                    itemId: KeyEventHandler.boxSelectionState.endItemId,
                    offset: KeyEventHandler.boxSelectionState.endOffset,
                    isActive: true,
                    userId: "local",
                });

                // Show visual hint indicating box selection direction
                if (typeof window !== "undefined") {
                    // Show direction hint
                    const direction = KeyEventHandler.getBoxSelectionDirection();
                    if (direction) {
                        // Remove existing hint
                        const existingHint = document.getElementById("box-selection-direction-hint");
                        if (existingHint) existingHint.remove();

                        // Create new hint
                        const hintEl = document.createElement("div");
                        hintEl.id = "box-selection-direction-hint";
                        hintEl.className = "box-selection-hint";
                        hintEl.textContent = direction;
                        hintEl.style.position = "fixed";
                        hintEl.style.bottom = "10px";
                        hintEl.style.right = "10px";
                        hintEl.style.backgroundColor = "rgba(0, 120, 215, 0.8)";
                        hintEl.style.color = "white";
                        hintEl.style.padding = "5px 10px";
                        hintEl.style.borderRadius = "3px";
                        hintEl.style.fontSize = "12px";
                        hintEl.style.zIndex = "9999";
                        hintEl.style.pointerEvents = "none";
                        hintEl.style.opacity = "0.9";
                        hintEl.style.transition = "opacity 0.3s ease-in-out";

                        document.body.appendChild(hintEl);

                        // Fade out hint after a certain time
                        setTimeout(() => {
                            hintEl.style.opacity = "0";
                            setTimeout(() => {
                                if (hintEl.parentNode) hintEl.parentNode.removeChild(hintEl);
                            }, 300);
                        }, 1500);
                    }
                }

                // Debug info
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    if (typeof window !== "undefined" && window.DEBUG_MODE) {
                        logger.debug(`Box selection updated:`, KeyEventHandler.boxSelectionState);
                    }
                }
            } catch (error) {
                // Log if error occurs
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.error({ error }, "Error in handleBoxSelection:");
                }
                // Cancel box selection
                KeyEventHandler.cancelBoxSelection();
            }
        } else {
            // Log if range is invalid
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(`Invalid box selection range, cancelling`);
                }
            }
            // Cancel box selection
            KeyEventHandler.cancelBoxSelection();
        }
    }

    /**
     * Update range of box selection
     */
    private static updateBoxSelectionRanges() {
        // Debug info
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug(`updateBoxSelectionRanges called`);
        }

        if (!KeyEventHandler.boxSelectionState.startItemId || !KeyEventHandler.boxSelectionState.endItemId) {
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(
                        `Invalid item IDs: startItemId=${KeyEventHandler.boxSelectionState.startItemId}, endItemId=${KeyEventHandler.boxSelectionState.endItemId}`,
                    );
                }
            }
            return;
        }

        try {
            // Get all items between start item and end item
            const itemsInRange = KeyEventHandler.getItemsBetween(
                KeyEventHandler.boxSelectionState.startItemId,
                KeyEventHandler.boxSelectionState.endItemId,
            );

            if (itemsInRange.length === 0) {
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug(`No items found in range`);
                }
                return;
            }

            // Calculate horizontal selection range
            const startX = Math.min(
                KeyEventHandler.boxSelectionState.startOffset,
                KeyEventHandler.boxSelectionState.endOffset,
            );
            const endX = Math.max(
                KeyEventHandler.boxSelectionState.startOffset,
                KeyEventHandler.boxSelectionState.endOffset,
            );

            // Calculate selection range for each item
            const ranges: Array<{
                itemId: string;
                startOffset: number;
                endOffset: number;
            }> = [];

            itemsInRange.forEach(item => {
                // Calculate start and end positions of selection
                let itemStartOffset = startX;
                let itemEndOffset = endX;

                // Correct if out of range
                if (itemStartOffset < 0) itemStartOffset = 0;
                if (itemEndOffset > item.text.length) itemEndOffset = item.text.length;

                // Add only if selection range is valid
                if (itemStartOffset < itemEndOffset) {
                    ranges.push({
                        itemId: item.id,
                        startOffset: itemStartOffset,
                        endOffset: itemEndOffset,
                    });
                }
            });

            // Update box selection ranges
            KeyEventHandler.boxSelectionState.ranges = ranges;

            // Debug info
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(`Box selection ranges updated:`, ranges);
                }
            }
        } catch (error) {
            // Log if error occurs
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                logger.error({ error }, "Error in updateBoxSelectionRanges:");
            }
            // Set empty range
            KeyEventHandler.boxSelectionState.ranges = [];
        }
    }

    /**
     * Get text of specified item
     * @param itemId Item ID
     * @returns Item text
     */
    static getItemText(itemId: string | null): string {
        if (!itemId) return "";

        // Get item efficiently using attribute selector.
        // While jsdom may be slow with this, it is highly optimized in modern browsers.
        const textElement = document.querySelector(
            `.outliner-item[data-item-id="${escapeId(itemId)}"] .item-text`,
        );
        return textElement ? textElement.textContent || "" : "";
    }

    /**
     * Get items adjacent to specified item
     * @param itemId Item ID
     * @param direction Direction ('prev' or 'next')
     * @returns Adjacent item info
     */
    static getAdjacentItem(
        itemId: string | null,
        direction: "prev" | "next",
    ): { id: string; text: string; } | null {
        if (!itemId) return null;

        // Find current item
        const currentItem = document.querySelector(
            `.outliner-item[data-item-id="${escapeId(itemId)}"]`,
        );
        if (!currentItem) return null;

        // Use TreeWalker for robust, DOM-order-based traversal regardless of nesting structure.
        const root = document.querySelector(".outliner") || document.body;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
            acceptNode(node) {
                return (node as Element).classList.contains("outliner-item")
                    ? NodeFilter.FILTER_ACCEPT
                    : NodeFilter.FILTER_SKIP;
            },
        });
        walker.currentNode = currentItem;

        const adjacentItem = (direction === "prev" ? walker.previousNode() : walker.nextNode()) as HTMLElement | null;
        if (!adjacentItem) return null;

        const adjacentItemId = adjacentItem.getAttribute("data-item-id");
        if (!adjacentItemId) return null;

        // Get text
        const textElement = adjacentItem.querySelector(".item-text");
        const text = textElement ? textElement.textContent || "" : "";

        return { id: adjacentItemId, text };
    }

    /**
     * Get all items between two items
     * @param startItemId Start Item ID
     * @param endItemId End Item ID
     * @returns Array of items
     */
    static getItemsBetween(startItemId: string, endItemId: string): Array<{ id: string; text: string; }> {
        // Debug info
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(`getItemsBetween called with startItemId=${startItemId}, endItemId=${endItemId}`);
            }
        }

        if (!startItemId || !endItemId) {
            return [];
        }

        try {
            const startEl = document.querySelector(
                `.outliner-item[data-item-id="${escapeId(startItemId)}"]`,
            );
            const endEl = document.querySelector(
                `.outliner-item[data-item-id="${escapeId(endItemId)}"]`,
            );

            if (!startEl || !endEl) {
                return [];
            }

            if (startEl === endEl) {
                const textEl = startEl.querySelector(".item-text");
                return [{ id: startItemId, text: textEl?.textContent || "" }];
            }

            // Compare position to find first and last
            const comparison = startEl.compareDocumentPosition(endEl);
            let firstEl: Element;
            let lastEl: Element;

            if (comparison & Node.DOCUMENT_POSITION_FOLLOWING) {
                firstEl = startEl;
                lastEl = endEl;
            } else {
                firstEl = endEl;
                lastEl = startEl;
            }

            const itemsInRange: Array<{ id: string; text: string; }> = [];

            // Use TreeWalker for robust traversal between first and last elements in DOM order.
            const root = document.querySelector(".outliner") || document.body;
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
                acceptNode(node) {
                    return (node as Element).classList.contains("outliner-item")
                        ? NodeFilter.FILTER_ACCEPT
                        : NodeFilter.FILTER_SKIP;
                },
            });
            walker.currentNode = firstEl;

            while (walker.currentNode) {
                const current = walker.currentNode as HTMLElement;
                const itemId = current.getAttribute("data-item-id");
                if (itemId) {
                    const textElement = current.querySelector(".item-text");
                    const text = textElement ? textElement.textContent || "" : "";
                    itemsInRange.push({ id: itemId, text });
                }

                if (current === lastEl) break;
                if (!walker.nextNode()) break;
            }

            // Debug info
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(`Found ${itemsInRange.length} items between ${startItemId} and ${endItemId}`);
                }
            }

            return itemsInRange;
        } catch (error) {
            // Log if error occurs
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                logger.error({ error }, "Error in getItemsBetween:");
            }
            return [];
        }
    }

    /**
     * Get direction of box selection
     * @returns String indicating direction
     */
    private static getBoxSelectionDirection(): string {
        if (
            !KeyEventHandler.boxSelectionState.active
            || !KeyEventHandler.boxSelectionState.startItemId
            || !KeyEventHandler.boxSelectionState.endItemId
        ) {
            return "";
        }

        try {
            const startEl = document.querySelector(
                `.outliner-item[data-item-id="${escapeId(KeyEventHandler.boxSelectionState.startItemId)}"]`,
            );
            const endEl = document.querySelector(
                `.outliner-item[data-item-id="${escapeId(KeyEventHandler.boxSelectionState.endItemId)}"]`,
            );

            if (!startEl || !endEl) return "";

            // Calculate horizontal selection range
            const startX = KeyEventHandler.boxSelectionState.startOffset;
            const endX = KeyEventHandler.boxSelectionState.endOffset;

            // Determine direction
            let direction = "";

            // Vertical direction via DOM position comparison
            const comparison = startEl.compareDocumentPosition(endEl);
            if (comparison & Node.DOCUMENT_POSITION_FOLLOWING) {
                direction += "↓"; // Down
            } else if (comparison & Node.DOCUMENT_POSITION_PRECEDING) {
                direction += "↑"; // Up
            }

            // Horizontal direction
            if (startX < endX) {
                direction += "→"; // Right
            } else if (startX > endX) {
                direction += "←"; // Left
            }

            // If direction cannot be determined
            if (!direction) {
                direction = "●"; // Dot
            }

            return direction;
        } catch (error) {
            // Log if error occurs
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                logger.error({ error }, "Error in getBoxSelectionDirection:");
            }
            return "";
        }
    }

    /**
     * Cancel box selection
     */
    static cancelBoxSelection() {
        // Debug info
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(`KeyEventHandler.cancelBoxSelection called`);
            }
        }

        try {
            // Reset box selection state
            KeyEventHandler.boxSelectionState = {
                active: false,
                startItemId: null,
                startOffset: 0,
                endItemId: null,
                endOffset: 0,
                ranges: [],
            };

            // Clear selections
            store.clearSelectionForUser("local");

            // Debug info
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug(`Box selection cancelled`);
            }
        } catch (error) {
            // Log if error occurs
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                logger.error({ error }, "Error in cancelBoxSelection:");
            }

            // Minimal state reset
            if (KeyEventHandler.boxSelectionState) {
                KeyEventHandler.boxSelectionState.active = false;
                KeyEventHandler.boxSelectionState.ranges = [];
            }
        }
    }

    /**
     * Async method to process paste events.
     * Caller should `await` and catch permission denial or read failures.
     * Catches Clipboard API permission errors and logs in DEBUG_MODE.
     * On failure, dispatches `clipboard-permission-denied` or `clipboard-read-error`
     * and inserts empty string to appear as no paste to the user.
     * @param event ClipboardEvent
     */
    static async handlePaste(event: ClipboardEvent): Promise<void> {
        const isSpecial = KeyEventHandler.nextPasteIsSpecial;
        KeyEventHandler.nextPasteIsSpecial = false;

        // Debug info

        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug(`KeyEventHandler.handlePaste called`);
        }

        // Do nothing when the paste belongs to another input or to a plain page selection
        if (!isEditorClipboardEvent(event)) return;

        // Prevent browser default paste action to avoid native insertion before await completes
        event.preventDefault();

        try {
            // Get plaintext
            let text = event.clipboardData?.getData("text/plain") || "";
            const encodedItems = event.clipboardData?.getData(OUTLINER_ITEMS_MIME) || "";
            const encodedHtmlItems = structuredClipboardFromHtml(event.clipboardData?.getData("text/html") || "");

            // Use Clipboard API if not available from event
            if (!text && typeof navigator !== "undefined" && navigator.clipboard) {
                try {
                    text = await navigator.clipboard.readText();
                } catch (error: unknown) {
                    if (
                        typeof window !== "undefined"
                        && window.DEBUG_MODE
                    ) {
                        if ((error as Error)?.name === "NotAllowedError") {
                            logger.warn("Clipboard permission denied", error);
                        } else {
                            logger.error({ error }, "navigator.clipboard.readText failed");
                        }
                    }

                    if (typeof window !== "undefined") {
                        window.dispatchEvent(
                            new CustomEvent(
                                (error as Error)?.name === "NotAllowedError"
                                    ? "clipboard-permission-denied"
                                    : "clipboard-read-error",
                            ),
                        );
                    }

                    text = "";
                }
            }

            // Fallback to global variable if text cannot be obtained (test environment only)
            // In production, event.clipboardData is always available, so this path is not executed
            // Required because Clipboard API may be restricted in E2E test environments
            if (
                !text && typeof window !== "undefined"
                && (window as Window & typeof globalThis & { [key: string]: unknown; }).lastCopiedText
            ) {
                text = String(
                    (window as Window & typeof globalThis & { [key: string]: unknown; }).lastCopiedText || "",
                );
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(`Using text from global variable: "${text}"`);
                }
            }

            if (!text) return;

            const cached = KeyEventHandler.lastStructuredClipboard;
            const structured = deserializeClipboardItems(
                encodedItems || encodedHtmlItems || (cached?.plainText === text ? cached.encoded : ""),
            );
            const destinationProjectId = generalStore.project?.ydoc?.guid;
            let specialVariant: PasteSpecialVariant | undefined;
            if (
                isSpecial && structured && destinationProjectId
                && structured.items.some(item => item.componentType !== undefined)
            ) {
                specialVariant = await requestPasteSpecialChoice(
                    pasteSpecialChoices(structured, destinationProjectId),
                );
                if (specialVariant === undefined) return;
            }
            if (specialVariant === "values-only") {
                // Keep the event's outward text flavor: rendered Grids already
                // contribute their visible query result there.
            }
            const sameProjectItems = structured && structured.sourceProjectId === destinationProjectId
                    && specialVariant !== "copy-with-data" && specialVariant !== "copy-without-data"
                    && specialVariant !== "values-only"
                ? structured.items
                : undefined;
            if (sameProjectItems) text = clipboardPlainText(structured!);

            // Get VS Code specific metadata
            let vscodeMetadata: unknown = null;
            try {
                const vscodeData = event.clipboardData?.getData("application/vscode-editor");
                if (vscodeData) {
                    vscodeMetadata = JSON.parse(vscodeData);

                    // Debug info
                    if (
                        typeof window !== "undefined"
                        && window.DEBUG_MODE
                    ) {
                        if (typeof window !== "undefined" && window.DEBUG_MODE) {
                            logger.debug(`VS Code metadata detected:`, vscodeMetadata);
                        }
                    }
                }
            } catch (error) {
                // Ignore if metadata parsing fails
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.error({ error }, "Failed to parse VS Code metadata:");
                }
            }

            // Debug info
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug(`Pasting text: "${text}"`);
            }

            // Save to global variable (E2E test environment only)
            // Not used in production, but needed to verify pasted content in E2E tests
            if (typeof window !== "undefined") {
                (window as Window & typeof globalThis & { [key: string]: unknown; }).lastPastedText = text;
                if (vscodeMetadata) {
                    (window as Window & typeof globalThis & { [key: string]: unknown; }).lastVSCodeMetadata =
                        vscodeMetadata;
                }
            }

            // Get current box selection
            const boxSelection = Object.values(store.selections).find(sel =>
                sel.isBoxSelection && sel.boxSelectionRanges && sel.boxSelectionRanges.length > 0
            );

            // If selection exists, delete selection before pasting
            Object.values(store.selections).filter(sel =>
                sel.startOffset !== sel.endOffset || sel.startItemId !== sel.endItemId
            );

            // If VS Code multi-cursor text is included
            if (
                vscodeMetadata && Array.isArray((vscodeMetadata as { multicursorText?: string[]; }).multicursorText)
                && (vscodeMetadata as { multicursorText?: string[]; }).multicursorText!.length > 0
            ) {
                // Debug info
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    if (typeof window !== "undefined" && window.DEBUG_MODE) {
                        logger.debug(
                            `VS Code multicursor text detected:`,
                            (vscodeMetadata as { multicursorText?: string[]; }).multicursorText,
                        );
                    }
                }

                const multicursorText = (vscodeMetadata as { multicursorText?: string[]; }).multicursorText!;
                const cursorInstances = store.getLocalCursorInstances();

                const pasteMode = (vscodeMetadata as { pasteMode?: string; }).pasteMode || "spread"; // Default is spread

                // pasteMode: 'spread' - Insert different text for each cursor
                // pasteMode: 'full' - Insert same text for each cursor
                if (pasteMode === "spread") {
                    // Insert corresponding text for each cursor
                    cursorInstances.forEach((cursor, index) => {
                        if (index < multicursorText.length) {
                            cursor.insertText(multicursorText[index]);
                        } else if (multicursorText.length > 0) {
                            // If more cursors than text, repeat last text
                            cursor.insertText(multicursorText[multicursorText.length - 1]);
                        }
                    });
                } else {
                    // 'full' mode: Insert same text for each cursor
                    const fullText = multicursorText.join("\n");
                    cursorInstances.forEach(cursor => cursor.insertText(fullText));
                }
                return;
            }

            // If pasting into box selection
            if (boxSelection && boxSelection.boxSelectionRanges) {
                // Debug info
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    if (typeof window !== "undefined" && window.DEBUG_MODE) {
                        logger.debug(`Pasting into box selection:`, boxSelection);
                    }
                }

                // Split text to paste into lines
                const lines = text.split(/\r?\n/);
                const boxRanges = boxSelection.boxSelectionRanges;

                // Debug info
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    if (typeof window !== "undefined" && window.DEBUG_MODE) {
                        logger.debug(`Box selection ranges:`, boxRanges);
                    }
                    if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug(`Lines to paste:`, lines);
                }

                // Paste text corresponding to each line of box selection
                for (let i = 0; i < boxRanges.length; i++) {
                    const range = boxRanges[i];
                    const itemId = range.itemId;
                    const startOffset = Math.min(range.startOffset, range.endOffset);
                    const endOffset = Math.max(range.startOffset, range.endOffset);

                    // Get item
                    const itemEl = document.querySelector(`[data-item-id="${itemId}"]`);
                    if (!itemEl) {
                        if (
                            typeof window !== "undefined"
                            && window.DEBUG_MODE
                        ) {
                            logger.warn(`Item element not found for ID: ${itemId}`);
                        }
                        continue;
                    }

                    // Get text element
                    const textEl = itemEl.querySelector(".item-text");
                    if (!textEl) {
                        if (
                            typeof window !== "undefined"
                            && window.DEBUG_MODE
                        ) {
                            logger.warn(`Text element not found for item ID: ${itemId}`);
                        }
                        continue;
                    }

                    // Get current text
                    const currentText = textEl.textContent || "";

                    // Text to paste (text corresponding to line, or last line)
                    const lineText = i < lines.length ? lines[i] : (lines.length > 0 ? lines[lines.length - 1] : "");

                    // Create new text (replace selection)
                    const newText = currentText.substring(0, startOffset) + lineText + currentText.substring(endOffset);

                    // Debug info
                    if (
                        typeof window !== "undefined"
                        && window.DEBUG_MODE
                    ) {
                        if (typeof window !== "undefined" && window.DEBUG_MODE) {
                            logger.debug(
                                `Item ${i} (ID: ${itemId}): Replacing text from ${startOffset} to ${endOffset}`,
                            );
                        }
                        if (typeof window !== "undefined" && window.DEBUG_MODE) {
                            logger.debug(`Current text: "${currentText}"`);
                        }
                        if (typeof window !== "undefined" && window.DEBUG_MODE) {
                            logger.debug(`Line text to paste: "${lineText}"`);
                        }
                        if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug(`New text: "${newText}"`);
                    }

                    // Get or create cursor instance
                    let cursor = Array.from(store.cursorInstances.values()).find(c => c.itemId === itemId);
                    if (!cursor) {
                        // Create new cursor
                        const cursorId = store.addCursor({
                            itemId,
                            offset: startOffset,
                            isActive: false,
                            userId: "local",
                        });
                        cursor = store.cursorInstances.get(cursorId);

                        if (
                            typeof window !== "undefined"
                            && window.DEBUG_MODE
                        ) {
                            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                                logger.debug(`Created new cursor for item ID: ${itemId}`);
                            }
                        }
                    }

                    // Update text
                    if (cursor) {
                        // Delete selection then insert text
                        const item = cursor.findTarget();
                        if (item) {
                            item.updateText(newText);
                            cursor.offset = startOffset + lineText.length;
                            cursor.applyToStore();

                            if (
                                typeof window !== "undefined"
                                && window.DEBUG_MODE
                            ) {
                                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                                    logger.debug(`Updated text for item ID: ${itemId}`);
                                }
                                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                                    logger.debug(`New cursor offset: ${cursor.offset}`);
                                }
                            }
                        } else {
                            if (
                                typeof window !== "undefined"
                                && window.DEBUG_MODE
                            ) {
                                logger.warn(`Target item not found for cursor with item ID: ${itemId}`);
                            }
                        }
                    } else {
                        if (
                            typeof window !== "undefined"
                            && window.DEBUG_MODE
                        ) {
                            logger.warn(`Cursor not found or created for item ID: ${itemId}`);
                        }
                    }
                }

                // Clear selections
                store.clearSelections();

                // Start cursor blinking
                store.startCursorBlink();

                // Save to global variable (for testing)
                if (typeof window !== "undefined") {
                    (window as Window & typeof globalThis & { [key: string]: unknown; }).lastBoxSelectionPaste = {
                        text,
                        lines,
                        boxRanges,
                    };
                }

                return;
            }

            // If pasting from box selection
            // In VS Code, copy from box selection contains special metadata
            const vscodeMetaAny = vscodeMetadata as {
                multicursorText?: string[];
                pasteMode?: string;
                isFromEmptySelection?: boolean;
                mode?: string;
            } | undefined;
            if (
                vscodeMetaAny && vscodeMetaAny.isFromEmptySelection === false
                && vscodeMetaAny.mode === "plaintext" && text.includes("\n")
            ) {
                // Process as paste from box selection
                const lines = text.split(/\r?\n/);

                // Debug info
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    if (typeof window !== "undefined" && window.DEBUG_MODE) {
                        logger.debug(`Box selection paste detected, lines:`, lines);
                    }
                }

                // Insert lines corresponding to each cursor
                const cursorInstances = store.getLocalCursorInstances();
                cursorInstances.forEach((cursor, index) => {
                    if (index < lines.length) {
                        cursor.insertText(lines[index]);
                    } else if (lines.length > 0) {
                        // If more cursors than lines, repeat last line
                        cursor.insertText(lines[lines.length - 1]);
                    }
                });
                return;
            }

            let structuredItems = specialVariant === "values-only" ? undefined : sameProjectItems;
            // Tables this paste created, and tables an earlier paste already
            // created here that this one binds to instead. Only the former may
            // be rolled back or undone.
            let pastedTableIdMap: Record<string, string> | undefined = undefined;
            let reusedTableIdMap: Record<string, string> = {};
            let pastedRuleIds: string[] = [];
            const destinationDoc = generalStore.project?.ydoc;
            if (
                structuredItems === undefined
                && specialVariant !== "values-only"
                && structured !== undefined
                && structured.version !== 1
                && destinationDoc !== undefined
                && (structured.sourceProjectId !== destinationDoc.guid
                    || specialVariant === "copy-with-data" || specialVariant === "copy-without-data")
            ) {
                const referencedTableIds = new Set(
                    structured.items.flatMap(item =>
                        item.componentType === "yjstable" && item.yjsTableId !== undefined ? [item.yjsTableId] : []
                    ),
                );
                const snapshots = structured.tables ?? {};
                const closureTableIds = computeSnapshotClosure(snapshots, referencedTableIds);
                const referencedSnapshots = Object.fromEntries(
                    [...closureTableIds].flatMap(sourceTableId => {
                        const snapshot = snapshots[sourceTableId];
                        return snapshot === undefined ? [] : [[sourceTableId, snapshot]];
                    }),
                );
                const hasCalendars = "calendars" in structured
                    && Object.keys(structured.calendars ?? {}).length > 0;
                if (Object.keys(referencedSnapshots).length > 0 || hasCalendars) {
                    if (Object.keys(referencedSnapshots).length > 0) {
                        const { cloneGridTablesAcrossProjects } = await import(
                            "../services/clipboard/crossProjectGridPaste"
                        );
                        const cloneResult = await cloneGridTablesAcrossProjects({
                            destinationDoc,
                            destinationProject: generalStore.project!,
                            sourceProjectId: structured.sourceProjectId,
                            snapshots: referencedSnapshots,
                            requestedSourceTableIds: [...referencedTableIds],
                            operation: structured.operation,
                            copyData: specialVariant !== "copy-without-data",
                            allowProvenanceReuse: specialVariant === undefined,
                            requestedVariant: specialVariant === "copy-with-data"
                                    || specialVariant === "copy-without-data"
                                ? specialVariant
                                : undefined,
                            isDestinationCurrent: () => generalStore.project?.ydoc === destinationDoc,
                        });
                        if (cloneResult === undefined) return;
                        pastedTableIdMap = cloneResult.tableIdMap;
                        reusedTableIdMap = cloneResult.reusedTableIdMap;
                        pastedRuleIds = cloneResult.createdRuleIds;
                    } else {
                        pastedTableIdMap = {};
                    }

                    const pastedCalendarIdMap: Record<string, string> = {};
                    if ("calendars" in structured && structured.calendars) {
                        const sqlNameMap = new Map<string, string>();
                        if (pastedTableIdMap) {
                            for (const [sourceTableId, destinationTableId] of Object.entries(pastedTableIdMap)) {
                                const srcTables = ("tables" in structured)
                                    ? structured.tables as Record<string, { sqlName?: string; }>
                                    : undefined;
                                const sourceSqlName = srcTables?.[sourceTableId]?.sqlName;
                                const destSqlName = listTables(destinationDoc).find(t =>
                                    t.tableId === destinationTableId
                                )?.sqlName;
                                if (sourceSqlName && destSqlName) {
                                    sqlNameMap.set(sourceSqlName, destSqlName);
                                }
                            }
                        }
                        for (
                            const [sourceCalendarId, settings] of Object.entries(
                                structured.calendars as Record<
                                    string,
                                    import("../services/calendar/calendarService").CalendarSettings
                                >,
                            )
                        ) {
                            const rewrittenQuery = rewriteTableQuerySql(settings.query, sqlNameMap).sql;
                            const newCalendarId = createCalendar(
                                generalStore.project!,
                                { ...settings, query: rewrittenQuery },
                            );
                            pastedCalendarIdMap[sourceCalendarId] = newCalendarId;
                        }
                    }

                    // The mapping still runs when `pastedTableIdMap` is empty:
                    // every table may have been reused from an earlier paste,
                    // and those hosts must still bind to something.
                    if (pastedTableIdMap || Object.keys(pastedCalendarIdMap).length > 0) {
                        // A reused table is as good a binding target as a fresh
                        // clone; only the undo entry distinguishes them.
                        const tableIdMap = { ...reusedTableIdMap, ...pastedTableIdMap };
                        const calendarIdMap = pastedCalendarIdMap;
                        let anyKept = false;
                        const mappedItems = structured.items.map(item => {
                            if (item.componentType === "yjstable") {
                                const destinationTableId = item.yjsTableId === undefined
                                    ? undefined
                                    : tableIdMap[item.yjsTableId];
                                if (destinationTableId === undefined) {
                                    return { text: item.text, depth: item.depth };
                                }
                                anyKept = true;
                                return { ...item, yjsTableId: destinationTableId };
                            }
                            if (item.componentType === "calendar") {
                                const destinationCalendarId = item.calendarId === undefined
                                    ? undefined
                                    : calendarIdMap[item.calendarId];
                                if (destinationCalendarId === undefined) {
                                    return { text: item.text, depth: item.depth };
                                }
                                anyKept = true;
                                return { ...item, calendarId: destinationCalendarId };
                            }
                            anyKept = true;
                            return item;
                        });
                        if (anyKept) structuredItems = mappedItems;
                        else structuredItems = undefined;
                    }
                }
            }

            // The outward text flavor renders a Grid as its rows (spec §7), so
            // it holds one line per row where the payload holds one host item.
            // An in-app paste has to follow the payload, or the copied items
            // and the pasted lines drift apart and the component bindings land
            // on the wrong items. `values-only` deliberately wants the rendered
            // text and leaves `structuredItems` unset, so it keeps this text.
            if (structuredItems && structured) text = clipboardPlainText(structured);

            // Treat as multi-item paste if normal multi-line text or portable structured items.
            if (text.includes("\n") || structuredItems) {
                const cursor = store.getLocalCursorInstances().find(value => value.isActive);
                if (typeof window !== "undefined") {
                    window.dispatchEvent(
                        new CustomEvent("paste-multi-item", {
                            detail: {
                                lines: text.split(/\r?\n/),
                                structuredItems,
                                selections: Object.values(store.selections).filter(selection =>
                                    selection.startOffset !== selection.endOffset
                                    || selection.startItemId !== selection.endItemId
                                ),
                                activeItemId: store.getActiveItem(),
                                cursor,
                            },
                        }),
                    );

                    // If a cross-project paste created tables, group the new tables, the schedule rules
                    // that came with them and the item insertion into a single undoable unit so undo
                    // removes everything and redo restores all of it.
                    if (
                        pastedTableIdMap && Object.keys(pastedTableIdMap).length > 0 && destinationDoc
                        && generalStore.undoManager
                    ) {
                        const { globalUndoRouter } = await import("../services/undo/undoRouter.svelte");
                        globalUndoRouter.captureCrossProjectPaste(
                            generalStore.undoManager,
                            destinationDoc,
                            Object.values(pastedTableIdMap),
                            pastedRuleIds,
                        );
                    }
                    if (
                        specialVariant === "another-view" || specialVariant === "values-only"
                        || ((specialVariant === "copy-with-data" || specialVariant === "copy-without-data")
                            && Object.keys(pastedTableIdMap ?? {}).length === 0)
                    ) {
                        reportPasteSpecialVariant(specialVariant);
                    }
                }
                return;
            }

            // If single line text, insert at cursor position
            const cursorInstances = store.getLocalCursorInstances();
            cursorInstances.forEach(cursor => cursor.insertText(text));
            if (specialVariant === "values-only") reportPasteSpecialVariant(specialVariant);
        } catch (error) {
            // Log error and notify UI if error occurs
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                if ((error as Error)?.name !== "NotAllowedError") {
                    logger.error({ error }, "Error in handlePaste:");
                }
            }
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("clipboard-read-error"));
            }
        }
    }

    /**
     * Process cut event
     * @param event ClipboardEvent
     */
    static handleCut(event: ClipboardEvent) {
        // Debug info
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug(`KeyEventHandler.handleCut called`);
        }

        // Do nothing when the cut belongs to another input or to a plain page selection
        if (!isEditorClipboardEvent(event)) return;

        // Do nothing if no selection
        const selections = Object.values(store.selections);
        if (selections.length === 0) return;

        // Prevent browser default cut action
        event.preventDefault();

        // Check if box selection
        const boxSelection = selections.find(sel => sel.isBoxSelection);

        // Get text of selection range
        let selectedText: string;
        let isBoxSelectionCut = false;
        const structured = selectedItemsClipboardData("cut");

        if (boxSelection) {
            // If box selection
            selectedText = store.getSelectedText("local");
            isBoxSelectionCut = true;

            // Debug info
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(`Box selection text: "${selectedText}"`);
                }
            }
        } else {
            // If normal selection range
            selectedText = store.getSelectedText("local");

            // Debug info
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug(`Selected text from store: "${selectedText}"`);
                }
            }
        }

        if (structured) selectedText = structured.plainText;
        KeyEventHandler.lastStructuredClipboard = structured;
        if (structured?.truncated) {
            logger.warn("Grid export hit the clipboard size cap; the trimmed copy carries a notice.");
        }
        if (structured) writeStructuredSystemClipboard(structured);

        // If selection text could be obtained
        if (selectedText) {
            try {
                // Write to clipboard
                if (event.clipboardData) {
                    // Set plaintext
                    event.clipboardData.setData("text/plain", selectedText);
                    if (structured) event.clipboardData.setData(OUTLINER_ITEMS_MIME, structured.encoded);
                    if (structured) {
                        event.clipboardData.setData(
                            "text/html",
                            structuredClipboardHtml(structured.encoded, selectedText, structured.html),
                        );
                    }

                    // Add VS Code compatible metadata
                    if (isBoxSelectionCut) {
                        try {
                            // VS Code box selection metadata format
                            const vscodeMetadata = {
                                isFromEmptySelection: false,
                                mode: "plaintext",
                                multicursorText: selectedText.split(/\r?\n/),
                                pasteMode: "spread",
                            };

                            // Convert metadata to JSON string
                            const metadataJson = JSON.stringify(vscodeMetadata);

                            // Set VS Code compatible metadata
                            event.clipboardData.setData("application/vscode-editor", metadataJson);

                            // Debug info
                            if (
                                typeof window !== "undefined"
                                && window.DEBUG_MODE
                            ) {
                                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                                    logger.debug(`VS Code metadata added:`, vscodeMetadata);
                                }
                            }
                        } catch (error) {
                            // Log if setting metadata fails
                            if (
                                typeof window !== "undefined"
                                && window.DEBUG_MODE
                            ) {
                                logger.error({ error }, "Failed to set VS Code metadata:");
                            }
                        }
                    }
                }

                // Save to global variable (E2E test environment only)
                // Not used in production, but needed to verify cut content in E2E tests
                if (typeof window !== "undefined") {
                    (window as Window & typeof globalThis & { [key: string]: unknown; }).lastCopiedText = selectedText;
                    (window as Window & typeof globalThis & { [key: string]: unknown; }).lastCopiedStructuredItems =
                        structured?.encoded;

                    (window as Window & typeof globalThis & { [key: string]: unknown; }).lastCopiedIsBoxSelection =
                        isBoxSelectionCut;
                }

                // Write to navigator.clipboard for robust system clipboard access
                if (
                    typeof navigator !== "undefined"
                    && navigator?.clipboard?.writeText && !event.isTrusted && !structured
                ) {
                    navigator.clipboard.writeText(selectedText).catch((err: unknown) => {
                        if (
                            typeof window !== "undefined"
                            && window.DEBUG_MODE
                        ) {
                            logger.error({ error: err }, "navigator.clipboard.writeText failed in handleCut:");
                        }
                    });
                }

                // Fallback: Copy using execCommand. Skipped for structured
                // payloads because it would replace the HTML flavour that
                // carries the component bindings with plain text.
                if (!event.isTrusted && !structured) {
                    // Selecting the helper element takes focus off the global textarea, and
                    // removing it leaves the document with no focused element at all. That
                    // tears down the software keyboard's editing session, so hand focus back.
                    const previouslyFocused = document.activeElement as HTMLElement | null;
                    const textarea = document.createElement("textarea");
                    textarea.value = selectedText;
                    textarea.style.position = "absolute";
                    textarea.style.left = "-9999px";
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand("copy");
                    document.body.removeChild(textarea);
                    previouslyFocused?.focus?.();
                }

                // Debug info
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    if (typeof window !== "undefined" && window.DEBUG_MODE) {
                        logger.debug(
                            `Clipboard updated with: "${selectedText}" (using navigator.clipboard & execCommand fallback)`,
                        );
                    }
                }
            } catch (error) {
                // Log if error occurs
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.error({ error }, "Error in handleCut:");
                }
            }
        }

        // Delete text of selection range (essence of cut action)
        if (selectedText) {
            const cursorInstances = store.getLocalCursorInstances();
            cursorInstances.forEach(cursor => {
                // Delete selection (cut action)
                cursor.cutSelectedText();
            });

            if (structured) clearRetainedComponentHost();

            // Clear selections
            store.clearSelections();
        }
    }
}

// Expose KeyEventHandler globally for testing
if (typeof window !== "undefined") {
    // The literal MODE comparison lets Rollup drop this assignment from the
    // production bundle (see ENV-production-build-leak.test.ts).
    if (import.meta.env.MODE !== "production") {
        (window as Window & typeof globalThis & { [key: string]: unknown; }).__KEY_EVENT_HANDLER__ = KeyEventHandler;
    }
}
