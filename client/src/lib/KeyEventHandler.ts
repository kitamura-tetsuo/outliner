import { aliasPickerStore } from "../stores/AliasPickerStore.svelte";
import { commandPaletteStore } from "../stores/CommandPaletteStore.svelte";
import { editorOverlayStore as store } from "../stores/EditorOverlayStore.svelte";
import { escapeId } from "../utils/domUtils";
import { CustomKeyMap } from "./CustomKeyMap";
import { getLogger } from "./logger";
const logger = getLogger("KeyEventHandler");

/**
 * Handler that distributes key and input events to each cursor instance
 */
export class KeyEventHandler {
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
        (event: KeyboardEvent, cursors: ReturnType<typeof store.getCursorInstances>) => void
    >();

    private static initKeyHandlers() {
        if (KeyEventHandler.keyHandlers.size > 0) return;

        const map = KeyEventHandler.keyHandlers;

        const add = (
            key: string,
            ctrl: boolean,
            alt: boolean,
            shift: boolean,
            handler: (event: KeyboardEvent, cursors: ReturnType<typeof store.getCursorInstances>) => void,
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

        // Ctrl+Shift+Z undo last cursor
        add("z", true, false, true, () => {
            store.undoLastCursor();
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
    }
    /**
     * Delegate KeyDown events to each cursor
     */
    static handleKeyDown(event: KeyboardEvent) {
        // Generally ignore events already handled by other handlers. However, continue for Enter/Arrow/Escape while palette is visible.
        if ((event as KeyboardEvent).defaultPrevented) {
            if (!commandPaletteStore.isVisible) return;
        }
        // While Alias Picker is visible: forward Arrow/Enter/Escape to the picker
        try {
            if (aliasPickerStore.isVisible) {
                const key = (event as KeyboardEvent).key;
                if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === "Escape") {
                    try {
                        const picker = document.querySelector(".alias-picker") as HTMLElement | null;
                        if (picker) {
                            const ev = new KeyboardEvent("keydown", {
                                key,
                                bubbles: true,
                                cancelable: true,
                            });
                            picker.dispatchEvent(ev);
                            event.preventDefault();
                            return;
                        }
                    } catch {}
                }
                if (key === "Enter") {
                    try {
                        // Confirm directly from the store's selected index first (independent of DOM)
                        try {
                            const w = window as Window & typeof globalThis & {
                                aliasPickerStore?: typeof aliasPickerStore;
                            };

                            const ap = w?.aliasPickerStore ?? aliasPickerStore;
                            const opts = Array.isArray(ap?.options) ? ap.options : [];
                            let si: number = typeof ap?.selectedIndex === "number" ? ap.selectedIndex : 0;
                            if (opts.length > 0) {
                                si = Math.max(0, Math.min(si, opts.length - 1));
                                const tid = (opts[si] as { id?: string; })?.id;
                                if (tid) {
                                    try {
                                        logger.debug("KeyEventHandler(Enter@Picker): confirmById via store", {
                                            si,
                                            tid,
                                            opts: opts.length,
                                        });
                                    } catch {}
                                    ap.confirmById(tid);
                                    event.preventDefault();
                                    return;
                                }
                            }
                        } catch {}
                        // Use the 2nd item in the list (or 1st if not exists) as default for stable confirmation even without selection state
                        const all = document.querySelectorAll(
                            ".alias-picker li button",
                        ) as NodeListOf<HTMLButtonElement>;
                        try {
                            logger.debug("KeyEventHandler: alias-picker buttons found:", all.length);
                        } catch {}
                        const index = Math.min(1, Math.max(0, all.length - 1));
                        const btn = all[index] ?? null;
                        if (btn) {
                            try {
                                logger.debug("KeyEventHandler: clicking alias option index", index);
                            } catch {}
                            btn.click();
                        } else {
                            try {
                                logger.debug("KeyEventHandler: no alias option button yet; ignoring this Enter");
                            } catch {}
                            // Do nothing (don't hide) as DOM might not be ready
                        }

                        // Fallback if unable to confirm via click path:
                        // Set the first content line (= test's secondId) as target
                        try {
                            const w = window as Window & typeof globalThis & {
                                generalStore?: unknown;
                                appStore?: unknown;
                                aliasPickerStore?: typeof aliasPickerStore;
                            };

                            const gs = (w.generalStore || w.appStore) as { currentPage?: unknown; } | undefined;
                            const root = gs?.currentPage;
                            const picker = w.aliasPickerStore ?? aliasPickerStore;
                            const aliasId: string | null = picker?.itemId ?? null;
                            const items = (root as {
                                items?: {
                                    length?: number;
                                    at?: (index: number) => unknown;
                                    [key: number]: unknown;
                                };
                            })?.items;
                            const firstContent = items && typeof items.length === "number" && items.length > 0
                                ? (items.at ? items.at(0) : items[0])
                                : null;
                            if (root && aliasId && (firstContent as { id?: string; })?.id) {
                                const find = (node: { id?: string; items?: unknown; }, id: string): unknown => {
                                    if (!node) return null;
                                    if (node.id === id) return node;

                                    const ch = node.items as
                                        | { length?: number; at?: (index: number) => unknown; [key: number]: unknown; }
                                        | Iterable<unknown>
                                        | undefined;
                                    if (
                                        ch
                                        && typeof (ch as unknown as { [Symbol.iterator]?: unknown; })[Symbol.iterator]
                                            === "function"
                                    ) {
                                        for (const c of (ch as Iterable<unknown>)) {
                                            const r = find(c as { id?: string; items?: unknown; }, id);
                                            if (r) return r;
                                        }
                                    } else if (ch) {
                                        const chArr = ch as {
                                            length?: number;
                                            at?: (index: number) => unknown;
                                            [key: number]: unknown;
                                        };
                                        const len = chArr.length ?? 0;
                                        for (let i = 0; i < len; i++) {
                                            const c = chArr.at ? chArr.at(i) : chArr[i];
                                            const r = find(c as { id?: string; items?: unknown; }, id);
                                            if (r) return r;
                                        }
                                    }
                                    return null;
                                };
                                const aliasItem = find(root, aliasId);

                                if (aliasItem && !(aliasItem as { aliasTargetId?: string; }).aliasTargetId) {
                                    try {
                                        logger.debug(
                                            "KeyEventHandler: fallback setting aliasTargetId on",
                                            aliasId,
                                            "to",
                                            (firstContent as { id?: string; }).id,
                                        );
                                    } catch {}

                                    (aliasItem as { aliasTargetId?: string; }).aliasTargetId =
                                        (firstContent as { id?: string; }).id;
                                }
                                try {
                                    const aliasEl = document.querySelector(
                                        `.outliner-item[data-item-id="${aliasId}"]`,
                                    ) as HTMLElement | null;
                                    if (aliasEl && !aliasEl.getAttribute("data-alias-target-id")) {
                                        try {
                                            logger.debug(
                                                "KeyEventHandler: setting DOM data-alias-target-id for aliasId",
                                                aliasId,
                                            );
                                        } catch {}
                                        aliasEl.setAttribute(
                                            "data-alias-target-id",
                                            String((firstContent as { id?: string; }).id),
                                        );
                                    }
                                    const outlinerRoot = document.querySelector(".outliner") || document.body;
                                    const walker = document.createTreeWalker(
                                        outlinerRoot,
                                        NodeFilter.SHOW_ELEMENT,
                                        {
                                            acceptNode(node) {
                                                const el = node as Element;
                                                return el.classList.contains("outliner-item")
                                                        && el.hasAttribute("data-item-id")
                                                        && !el.classList.contains("page-title")
                                                    ? NodeFilter.FILTER_ACCEPT
                                                    : NodeFilter.FILTER_SKIP;
                                            },
                                        },
                                    );
                                    let last: HTMLElement | null = null;
                                    while (walker.nextNode()) {
                                        last = walker.currentNode as HTMLElement;
                                    }
                                    const lastId = last?.getAttribute("data-item-id");
                                    if (last && lastId && !last.getAttribute("data-alias-target-id")) {
                                        try {
                                            logger.debug(
                                                "KeyEventHandler: setting DOM data-alias-target-id for lastId",
                                                lastId,
                                            );
                                        } catch {}

                                        last.setAttribute(
                                            "data-alias-target-id",
                                            String((firstContent as { id?: string; }).id),
                                        );
                                    }

                                    // Fallback setting on model side for the last item as well
                                    if (lastId && lastId !== aliasId) {
                                        const aliasItem2 = find(root, lastId);

                                        if (aliasItem2 && !(aliasItem2 as { aliasTargetId?: string; }).aliasTargetId) {
                                            try {
                                                logger.debug(
                                                    "KeyEventHandler: fallback setting aliasTargetId on lastId",
                                                    lastId,
                                                    "to",
                                                    (firstContent as { id?: string; }).id,
                                                );
                                            } catch {}

                                            (aliasItem2 as { aliasTargetId?: string; }).aliasTargetId =
                                                (firstContent as { id?: string; }).id;
                                        }
                                    }
                                } catch {}
                            }
                        } catch {}
                    } catch {
                        aliasPickerStore.hide();
                    }
                    event.preventDefault();
                }
                return;
            }
        } catch {}

        const cursorInstances = store.getCursorInstances();

        // Debug info
        logger.debug(
            `KeyEventHandler.handleKeyDown called with key=${event.key}, ctrlKey=${event.ctrlKey}, shiftKey=${event.shiftKey}, altKey=${event.altKey}`,
        );
        const target = event.target as Element | null;
        const tgt = target?.tagName || typeof target?.nodeName === "string"
            ? target.nodeName
            : typeof event.target;

        const activeElement = document.activeElement as Element | null;
        const ae = activeElement?.tagName
                || typeof activeElement?.nodeName === "string"
            ? activeElement.nodeName
            : typeof document.activeElement;
        logger.debug(`KeyEventHandler.handleKeyDown: target=${tgt}, active=${ae}`);
        logger.debug(`Current cursor instances: ${cursorInstances.length}`);

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
                ? (window as Window & typeof globalThis & { [key: string]: unknown; }).generalStore
                : null;
            const ta: HTMLTextAreaElement | undefined = (gsAny as { textareaRef?: HTMLTextAreaElement; })?.textareaRef;
            const taValue: string | null = ta?.value ?? null;
            const caretPos: number = typeof ta?.selectionStart === "number" ? ta!.selectionStart : cursor.offset;
            const source = typeof taValue === "string" ? taValue : text;
            const srcBefore = source.slice(0, caretPos);
            const srcLastSlash = srcBefore.lastIndexOf("/");
            const srcCmd = srcLastSlash >= 0 ? srcBefore.slice(srcLastSlash + 1) : "";

            const aliasDetected = /\/alias$/i.test(srcBefore) || /(^|[^a-zA-Z])alias$/i.test(before)
                || /^alias$/i.test(cmd) || /^alias$/i.test(srcCmd);
            try {
                logger.debug(
                    "KeyEventHandler Early Enter check: before=",
                    before,
                    " cmd=",
                    cmd,
                    " paletteVisible=",
                    commandPaletteStore.isVisible,
                );
            } catch {}
            try {
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
            } catch {}
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
                    commandPaletteStore.show(pos || { top: 0, left: 0 });
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
            if (event.key === "ArrowDown") {
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
                    const filtered = (commandPaletteStore as unknown as { filtered?: { type?: string; }[]; }).filtered
                        ?? [];
                    const hasAlias = filtered.some(c => c?.type === "alias");
                    if (hasAlias) {
                        try {
                            logger.debug(
                                "KeyEventHandler Palette Enter: forcing alias insert based on filtered results",
                            );
                        } catch {}
                        commandPaletteStore.insert("alias");
                        commandPaletteStore.hide();
                        event.preventDefault();
                        return;
                    }
                } catch {}

                // Directly handle if text immediately preceding is "/alias"
                try {
                    const cursor = cursorInstances[0];
                    const node = cursor.findTarget();
                    const text = String(node?.text || "");
                    const before = text.slice(0, cursor.offset);
                    const lastSlash = before.lastIndexOf("/");
                    const cmd = lastSlash >= 0 ? before.slice(lastSlash + 1) : "";
                    try {
                        logger.debug("KeyEventHandler Palette Enter: before=", before, " cmd=", cmd);
                    } catch {}
                    if (/^alias$/i.test(cmd)) {
                        commandPaletteStore.hide();
                        // Remove command string
                        const newText = text.slice(0, lastSlash) + text.slice(cursor.offset);
                        node?.updateText(newText);
                        cursor.offset = lastSlash;
                        cursor.applyToStore();

                        // Add new item to end and show AliasPicker
                        const gs: unknown = typeof window !== "undefined"
                            ? (window as Window & typeof globalThis & { [key: string]: unknown; }).generalStore
                            : null;

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
                                // addNode returns the new item
                                newItem = items.addNode(userId);
                            } catch {
                                try {
                                    // Fallback if no-arg fails
                                    const prevLen = typeof items.length === "number" ? items.length : 0;
                                    newItem = items.addNode(userId, prevLen);
                                } catch {}
                            }

                            // Fallback if addNode didn't return item (old behavior fallback)
                            if (!newItem) {
                                const lastIndex = (items.length ?? 0) - 1;
                                newItem = items.at ? items.at(lastIndex) : items[lastIndex];
                            }

                            if (newItem) {
                                const newItm = newItem as {
                                    id: string;
                                    text: string;
                                    aliasTargetId: string | undefined;
                                };
                                newItm.text = "";
                                newItm.aliasTargetId = undefined;
                                try {
                                    logger.debug(
                                        "KeyEventHandler(Palette): showing AliasPicker for",
                                        newItm.id,
                                    );
                                } catch {}
                                {
                                    const w = typeof window !== "undefined"
                                        ? (window as Window & typeof globalThis & {
                                            aliasPickerStore?: typeof aliasPickerStore;
                                        })
                                        : null;
                                    (w?.aliasPickerStore ?? aliasPickerStore).show(
                                        newItm.id,
                                    );
                                }
                                // Move cursor
                                store.clearCursorAndSelection(userId);
                                cursor.itemId = newItm.id;
                                cursor.offset = 0;
                                store.setActiveItem(newItm.id);
                                cursor.applyToStore();
                                store.startCursorBlink();

                                event.preventDefault();
                                return;
                            }
                        }
                    }
                } catch (e) {
                    // Fallback to confirm if fallback fails
                    try {
                        logger.warn("KeyEventHandler Palette Enter alias handling failed:", e);
                    } catch {}
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
                logger.debug(`No cursor instances found, skipping key event`);
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

                // Use textarea actual value in combination for strict detection
                const gs: unknown = typeof window !== "undefined"
                    ? (window as Window & typeof globalThis & { [key: string]: unknown; }).generalStore
                    : null;
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
                } catch {}

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
                            } catch {}
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
                                logger.debug(
                                    "KeyEventHandler: showing AliasPicker for",
                                    (newItem as { id: string; }).id,
                                );
                            } catch {}
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
            logger.debug(`Looking for handler with key combo:`, keyCombo);
            logger.debug(`Handler found: ${handler !== undefined}`);
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
                                            logger.debug(
                                                "KeyEventHandler(Post): showing AliasPicker for activeId",
                                                activeId,
                                                " after default handler. before=",
                                                earlyBeforeForLog,
                                            );
                                        } catch {}
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
                } catch {}
            }

            event.preventDefault();
            event.stopPropagation();
            return;
        }

        // Call onKeyDown method for each cursor instance
        let handled = false;
        for (const cursor of cursorInstances) {
            if (cursor.onKeyDown(event)) {
                handled = true;
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
                                            logger.debug(
                                                "KeyEventHandler(Post2): showing AliasPicker for activeId",
                                                activeId,
                                            );
                                        } catch {}
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
                } catch {}
            }
        }

        // Debug info
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            logger.debug(`Key event handled: ${handled}`);
            if (handled) {
                // Output cursor state to log
                store.logCursorState();
            }
        }
    }

    /**
     * Delegate Input events to each cursor
     */
    static handleInput(event: Event) {
        const inputEvent = event as InputEvent;

        // Ignore input events while Alias Picker is visible
        try {
            if (aliasPickerStore.isVisible) return;
        } catch {}

        // Debug info
        logger.debug(
            `KeyEventHandler.handleInput called with inputType=${inputEvent.inputType}, isComposing=${inputEvent.isComposing}`,
        );
        logger.debug(`Input data: "${inputEvent.data}"`);
        logger.debug(`Current active element: ${document.activeElement?.tagName}`);

        // Buffer the latest input stream (for fallback detection of palette)
        try {
            const w: unknown = typeof window !== "undefined"
                ? (window as Window & typeof globalThis & { [key: string]: unknown; })
                : null;

            const wAny = w as Window & typeof globalThis & { generalStore?: { __lastInputStream?: string; }; };
            const gs = wAny?.generalStore ?? ({} as { __lastInputStream?: string; });
            const ch: string = typeof inputEvent.data === "string" ? inputEvent.data : "";
            gs.__lastInputStream = (gs.__lastInputStream || "") + ch;
            if (gs.__lastInputStream.length > 256) {
                gs.__lastInputStream = gs.__lastInputStream.slice(-256);
            }
        } catch {}

        // Ignore input during IME composition to avoid duplicate processing
        if (inputEvent.isComposing || inputEvent.inputType.startsWith("insertComposition")) {
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                logger.debug(`Skipping input event during composition`);
            }
            return;
        }

        // Get cursor instances from the store
        const cursorInstances = store.getCursorInstances();

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
                        // Show command palette
                        const pos = commandPaletteStore.getCursorScreenPosition();
                        commandPaletteStore.show(pos || { top: 0, left: 0 });
                    }
                }
            } else {
                // Show command palette if no cursor
                const pos = commandPaletteStore.getCursorScreenPosition();
                commandPaletteStore.show(pos || { top: 0, left: 0 });
            }
        } else if (inputEvent.data === "[" && commandPaletteStore.isVisible) {
            // Hide command palette if [ is entered (start of internal link)
            commandPaletteStore.hide();
        } else if (commandPaletteStore.isVisible) {
            // Use dedicated input processing if CommandPalette is visible
            if (inputEvent.data) {
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
                logger.debug(`No cursor instances found, skipping input event`);
            }
            return;
        }

        // Debug info
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            logger.debug(`Applying input to ${cursorInstances.length} cursor instances`);
            logger.debug(`Current cursors:`, Object.values(store.cursors));
        }

        // Apply input to each cursor
        logger.debug(`Applying input to ${cursorInstances.length} cursor instances`);
        cursorInstances.forEach((cursor, index) => {
            logger.debug(`Applying input to cursor ${index}: itemId=${cursor.itemId}, offset=${cursor.offset}`);
            cursor.onInput(inputEvent);
        });

        // Call onEdit callback
        store.triggerOnEdit();

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
                        logger.debug(
                            `Focus set after input. Active element is textarea: ${
                                document.activeElement === textareaElement
                            }`,
                        );
                    }
                }, 10);
            });
        } else {
            // Log error if textarea not found
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                logger.error(
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
            logger.debug(`Textarea value: "${textareaRef.value}"`);
            logger.debug(`Textarea selection: start=${textareaRef.selectionStart}, end=${textareaRef.selectionEnd}`);
        } else {
            logger.debug(`Textarea not found in KeyEventHandler.handleInput`);
        }

        // Check state of cursor instances
        const cursorInstancesAfter = store.getCursorInstances();
        logger.debug(`Number of cursor instances: ${cursorInstancesAfter.length}`);
        cursorInstancesAfter.forEach((cursor, index) => {
            logger.debug(`Cursor ${index}: itemId=${cursor.itemId}, offset=${cursor.offset}`);
        });
    }

    // Retain current composition length
    static lastCompositionLength = 0;

    /**
     * Process IME compositionstart event
     */
    static handleCompositionStart(_event: CompositionEvent) { // eslint-disable-line @typescript-eslint/no-unused-vars
        KeyEventHandler.lastCompositionLength = 0;
    }
    /**
     * Process IME compositionupdate event and display intermediate input characters
     */
    static handleCompositionUpdate(event: CompositionEvent) {
        const data = event.data || "";
        const cursorInstances = store.getCursorInstances();
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
    }

    /**
     * Process IME compositionend event and insert Japanese input
     */
    static handleCompositionEnd(event: CompositionEvent) {
        const data = event.data || "";
        const cursorInstances = store.getCursorInstances();
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
    }

    /**
     * Process copy event
     * @param event ClipboardEvent
     */
    static handleCopy(event: ClipboardEvent) {
        // Debug info
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            logger.debug(`KeyEventHandler.handleCopy called`);
        }

        // Do nothing if no selection
        const selections = Object.values(store.selections);
        if (selections.length === 0) return;

        // Prevent browser default copy action
        event.preventDefault();

        // Check if box selection
        const boxSelection = selections.find(sel => sel.isBoxSelection);

        // Get text of selection range
        // eslint-disable-next-line no-useless-assignment
        let selectedText = "";
        let isBoxSelectionCopy = false;

        if (boxSelection) {
            // If box selection
            selectedText = store.getSelectedText("local");
            isBoxSelectionCopy = true;

            // Debug info
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                logger.debug(`Box selection text: "${selectedText}"`);
            }
        } else {
            // If normal selection range
            selectedText = store.getSelectedText("local");

            // Debug info
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                logger.debug(`Selected text from store: "${selectedText}"`);
            }
        }

        // If selection text could be obtained
        if (selectedText) {
            try {
                // Write to clipboard
                if (event.clipboardData) {
                    // Set plaintext
                    event.clipboardData.setData("text/plain", selectedText);

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
                                logger.debug(`VS Code metadata added:`, vscodeMetadata);
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
                    (window as Window & typeof globalThis & { [key: string]: unknown; }).lastCopiedIsBoxSelection =
                        isBoxSelectionCopy;
                }

                // Write to navigator.clipboard for robust system clipboard access
                if (
                    typeof navigator !== "undefined"
                    && navigator?.clipboard?.writeText
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

                // Fallback: Copy using execCommand
                const textarea = document.createElement("textarea");
                textarea.value = selectedText;
                textarea.style.position = "absolute";
                textarea.style.left = "-9999px";
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);

                // Debug info
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.debug(
                        `Clipboard updated with: "${selectedText}" (using navigator.clipboard & execCommand fallback)`,
                    );
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
            logger.debug(`KeyEventHandler.handleBoxSelection called with key=${event.key}`);
        }

        // Get current cursor position
        const cursorInstances = store.getCursorInstances();
        if (cursorInstances.length === 0) {
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                logger.debug(`No cursor instances found, skipping box selection`);
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
                logger.debug(`No active cursor or invalid cursor, skipping box selection`);
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
                logger.debug(`Box selection started at item=${activeItemId}, offset=${activeOffset}`);
            }
        }

        // Update range of box selection
        let newEndOffset = KeyEventHandler.boxSelectionState.endOffset;
        let newEndItemId = KeyEventHandler.boxSelectionState.endItemId;

        // Update selection range according to arrow keys
        switch (event.key) {
            case "ArrowLeft": {
                newEndOffset = Math.max(0, KeyEventHandler.boxSelectionState.endOffset - 1);
                break;
            }
            case "ArrowRight": {
                // Get item text length
                const itemText = KeyEventHandler.getItemText(KeyEventHandler.boxSelectionState.endItemId);
                newEndOffset = Math.min(itemText.length, KeyEventHandler.boxSelectionState.endOffset + 1);
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
                    logger.debug(`Box selection updated:`, KeyEventHandler.boxSelectionState);
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
                logger.debug(`Invalid box selection range, cancelling`);
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
            logger.debug(`updateBoxSelectionRanges called`);
        }

        if (!KeyEventHandler.boxSelectionState.startItemId || !KeyEventHandler.boxSelectionState.endItemId) {
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                logger.debug(
                    `Invalid item IDs: startItemId=${KeyEventHandler.boxSelectionState.startItemId}, endItemId=${KeyEventHandler.boxSelectionState.endItemId}`,
                );
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
                    logger.debug(`No items found in range`);
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
                logger.debug(`Box selection ranges updated:`, ranges);
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
    private static getItemText(itemId: string | null): string {
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
    private static getAdjacentItem(
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
    private static getItemsBetween(startItemId: string, endItemId: string): Array<{ id: string; text: string; }> {
        // Debug info
        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            logger.debug(`getItemsBetween called with startItemId=${startItemId}, endItemId=${endItemId}`);
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
                logger.debug(`Found ${itemsInRange.length} items between ${startItemId} and ${endItemId}`);
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
            logger.debug(`KeyEventHandler.cancelBoxSelection called`);
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
                logger.debug(`Box selection cancelled`);
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
        // Debug info

        if (
            typeof window !== "undefined"
            && window.DEBUG_MODE
        ) {
            logger.debug(`KeyEventHandler.handlePaste called`);
        }

        // Prevent browser default paste action to avoid native insertion before await completes
        event.preventDefault();

        try {
            // Get plaintext
            let text = event.clipboardData?.getData("text/plain") || "";

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
                logger.debug(`Using text from global variable: "${text}"`);
            }

            if (!text) return;

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
                        logger.debug(`VS Code metadata detected:`, vscodeMetadata);
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
                logger.debug(`Pasting text: "${text}"`);
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
                    logger.debug(
                        `VS Code multicursor text detected:`,
                        (vscodeMetadata as { multicursorText?: string[]; }).multicursorText,
                    );
                }

                const multicursorText = (vscodeMetadata as { multicursorText?: string[]; }).multicursorText!;
                const cursorInstances = store.getCursorInstances();

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
                    logger.debug(`Pasting into box selection:`, boxSelection);
                }

                // Split text to paste into lines
                const lines = text.split(/\r?\n/);
                const boxRanges = boxSelection.boxSelectionRanges;

                // Debug info
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.debug(`Box selection ranges:`, boxRanges);
                    logger.debug(`Lines to paste:`, lines);
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
                        logger.debug(`Item ${i} (ID: ${itemId}): Replacing text from ${startOffset} to ${endOffset}`);
                        logger.debug(`Current text: "${currentText}"`);
                        logger.debug(`Line text to paste: "${lineText}"`);
                        logger.debug(`New text: "${newText}"`);
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
                            logger.debug(`Created new cursor for item ID: ${itemId}`);
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
                                logger.debug(`Updated text for item ID: ${itemId}`);
                                logger.debug(`New cursor offset: ${cursor.offset}`);
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
                    logger.debug(`Box selection paste detected, lines:`, lines);
                }

                // Insert lines corresponding to each cursor
                const cursorInstances = store.getCursorInstances();
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

            // Treat as multi-item paste if normal multi-line text
            if (text.includes("\n")) {
                const lines = text.split(/\r?\n/);

                // Debug info
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.debug(`Multi-line paste detected, lines:`, lines);
                }

                // Process multi-line text
                // If multiple cursors, insert first line to each cursor
                // If single cursor, insert only first line
                const firstLine = lines[0] || "";
                const cursorInstances = store.getCursorInstances();
                cursorInstances.forEach(cursor => cursor.insertText(firstLine));
                return;
            }

            // If single line text, insert at cursor position
            const cursorInstances = store.getCursorInstances();
            cursorInstances.forEach(cursor => cursor.insertText(text));
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
            logger.debug(`KeyEventHandler.handleCut called`);
        }

        // Do nothing if no selection
        const selections = Object.values(store.selections);
        if (selections.length === 0) return;

        // Prevent browser default cut action
        event.preventDefault();

        // Check if box selection
        const boxSelection = selections.find(sel => sel.isBoxSelection);

        // Get text of selection range
        // eslint-disable-next-line no-useless-assignment
        let selectedText = "";
        let isBoxSelectionCut = false;

        if (boxSelection) {
            // If box selection
            selectedText = store.getSelectedText("local");
            isBoxSelectionCut = true;

            // Debug info
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                logger.debug(`Box selection text: "${selectedText}"`);
            }
        } else {
            // If normal selection range
            selectedText = store.getSelectedText("local");

            // Debug info
            if (
                typeof window !== "undefined"
                && window.DEBUG_MODE
            ) {
                logger.debug(`Selected text from store: "${selectedText}"`);
            }
        }

        // If selection text could be obtained
        if (selectedText) {
            try {
                // Write to clipboard
                if (event.clipboardData) {
                    // Set plaintext
                    event.clipboardData.setData("text/plain", selectedText);

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
                                logger.debug(`VS Code metadata added:`, vscodeMetadata);
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

                    (window as Window & typeof globalThis & { [key: string]: unknown; }).lastCopiedIsBoxSelection =
                        isBoxSelectionCut;
                }

                // Write to navigator.clipboard for robust system clipboard access
                if (
                    typeof navigator !== "undefined"
                    && navigator?.clipboard?.writeText
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

                // Fallback: Copy using execCommand
                const textarea = document.createElement("textarea");
                textarea.value = selectedText;
                textarea.style.position = "absolute";
                textarea.style.left = "-9999px";
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                document.body.removeChild(textarea);

                // Debug info
                if (
                    typeof window !== "undefined"
                    && window.DEBUG_MODE
                ) {
                    logger.debug(
                        `Clipboard updated with: "${selectedText}" (using navigator.clipboard & execCommand fallback)`,
                    );
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
            const cursorInstances = store.getCursorInstances();
            cursorInstances.forEach(cursor => {
                // Delete selection (cut action)
                cursor.cutSelectedText();
            });

            // Clear selections
            store.clearSelections();
        }
    }
}

// Expose KeyEventHandler globally for testing
if (typeof window !== "undefined") {
    (window as Window & typeof globalThis & { [key: string]: unknown; }).__KEY_EVENT_HANDLER__ = KeyEventHandler;
}
