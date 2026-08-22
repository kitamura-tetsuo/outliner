import { getLogger } from "../lib/logger";
const logger = getLogger("Store");
import { CALENDAR_COMPONENT_TYPE, GRID_COMPONENT_TYPE, LAYOUT_COMPONENT_TYPE } from "../services/layout/layoutModel";
import { createVisualNodeAtTarget } from "../services/outline/visualNodePlacement";
import { insertItemAfterTargetOrAppend } from "../utils/itemUtils";
import { aliasPickerStore } from "./AliasPickerStore.svelte";
import { editorOverlayStore } from "./EditorOverlayStore.svelte";

export type CommandType =
    | typeof GRID_COMPONENT_TYPE
    | typeof CALENDAR_COMPONENT_TYPE
    | typeof LAYOUT_COMPONENT_TYPE
    | "alias";

interface Position {
    top: number;
    left: number;
}

class CommandPaletteStore {
    isVisible = $state(false);
    position: Position = $state({ top: 0, left: 0 });
    query = $state("");
    selectedIndex = $state(0);

    // Cursor state dedicated to CommandPalette
    private commandCursorItemId: string | null = null;
    private commandCursorOffset: number = 0;
    private commandStartOffset: number = 0; // Position of slash

    /**
     * Each visual node kind has its own creation command (#5015): kinds cannot
     * be converted into one another, so creating the one you want is the whole
     * interaction. `keywords` only widens matching — "/grid" and "/database"
     * both reach the Grid block, whose stored discriminator is still
     * `yjstable`.
     */
    readonly commands: ReadonlyArray<{ label: string; type: CommandType; keywords?: string[]; }> = [
        { label: "Grid", type: GRID_COMPONENT_TYPE, keywords: ["database", "table"] },
        { label: "Calendar", type: CALENDAR_COMPONENT_TYPE, keywords: ["schedule"] },
        { label: "Layout", type: LAYOUT_COMPONENT_TYPE },
        { label: "Alias", type: "alias" },
    ];

    // Visible list is calculated by getter
    visible = $derived.by(() => {
        const q = (this.query || "").toLowerCase();
        if (!q) return this.commands;
        return this.commands.filter(c =>
            c.label.toLowerCase().includes(q) || (c.keywords ?? []).some(keyword => keyword.includes(q))
        );
    });

    show(pos: Position, isPostInsert: boolean = false) {
        this.position = pos;
        this.query = "";
        this.selectedIndex = 0;
        this.isVisible = true;

        // Record current cursor position
        const cursors = editorOverlayStore.getCursorInstances();
        if (cursors.length > 0) {
            const cursor = cursors[0];
            this.commandCursorItemId = cursor.itemId;
            this.commandCursorOffset = cursor.offset;
            this.commandStartOffset = isPostInsert ? Math.max(0, cursor.offset - 1) : cursor.offset; // Position of slash
        }
    }

    hide() {
        this.isVisible = false;
        this.commandCursorItemId = null;
        this.commandCursorOffset = 0;
        this.commandStartOffset = 0;
    }

    updateQuery(q: string) {
        if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug("[CommandPaletteStore] updateQuery:", q);
        this.query = q;
        this.selectedIndex = 0;
    }

    // Lightweight input that updates only the query without rewriting the model
    inputLight(ch: string) {
        if (typeof window !== "undefined" && window.DEBUG_MODE) logger.debug("[CommandPaletteStore] inputLight:", ch);
        this.query = (this.query || "") + ch;
        this.selectedIndex = 0;
    }
    backspaceLight() {
        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug("[CommandPaletteStore] backspaceLight, current query:", this.query);
        }
        if (!this.query) return;
        this.query = this.query.slice(0, -1);
        this.selectedIndex = 0;
    }

    /**
     * Act as a cursor and accumulate command strings
     * @param inputData input character
     */
    handleCommandInput(inputData: string) {
        if (!this.isVisible || !this.commandCursorItemId) return;

        const cursors = editorOverlayStore.getCursorInstances();
        if (cursors.length === 0) return;

        const cursor = cursors[0];
        const node = cursor.findTarget();
        if (!node) return;

        if (this.commandStartOffset < 0) {
            this.hide();
            return;
        }

        // Extract command part from current text
        const text = String(node.text || "");
        const safeStartOffset = Math.max(0, Math.min(this.commandStartOffset, text.length));
        const safeCursorOffset = Math.max(0, Math.min(cursor.offset, text.length));
        const beforeSlash = text.slice(0, safeStartOffset);
        const afterCursor = text.slice(safeCursorOffset);

        // Construct new command string
        const newCommandText = this.query + inputData;
        const newText = beforeSlash + "/" + newCommandText + afterCursor;

        // Update text
        node.updateText(newText);

        // Update cursor position
        const newOffset = this.commandStartOffset + 1 + newCommandText.length;
        cursor.offset = newOffset;
        this.commandCursorOffset = newOffset;

        // Update query
        this.query = newCommandText;
        this.selectedIndex = 0;
        try {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(
                    "CommandPaletteStore.handleCommandInput: query=",
                    this.query,
                    "visible=",
                    this.visible.map(c => c.label),
                );
            }
        } catch (_e) {
            logger.error(_e);
        }

        // Apply cursor
        cursor.applyToStore();

        // Update position
        const pos = this.getCursorScreenPosition();
        if (pos) this.updatePosition(pos);
    }

    /**
     * Delete command string with backspace
     */
    handleCommandBackspace() {
        if (!this.isVisible || !this.commandCursorItemId) return;

        const cursors = editorOverlayStore.getCursorInstances();
        if (cursors.length === 0) return;

        const cursor = cursors[0];
        const node = cursor.findTarget();
        if (!node) return;

        if (this.commandStartOffset < 0) {
            this.hide();
            return;
        }

        // If query is empty, delete slash as well and hide command palette
        if (this.query.length === 0) {
            const text = String(node.text || "");
            const safeStartOffset = Math.max(0, Math.min(this.commandStartOffset, text.length));
            const safeCursorOffset = Math.max(0, Math.min(cursor.offset, text.length));
            const beforeSlash = text.slice(0, safeStartOffset);
            const afterCursor = text.slice(safeCursorOffset);

            // Delete slash
            const newText = beforeSlash + afterCursor;
            node.updateText(newText);

            // Return cursor position to slash position
            cursor.offset = safeStartOffset;
            cursor.applyToStore();

            this.hide();
            return;
        }

        // Delete command part from current text
        const text = String(node.text || "");
        const safeStartOffset = Math.max(0, Math.min(this.commandStartOffset, text.length));
        const safeCursorOffset = Math.max(0, Math.min(cursor.offset, text.length));
        const beforeSlash = text.slice(0, safeStartOffset);
        const afterCursor = text.slice(safeCursorOffset);

        // Construct new command string (delete last character)
        const newCommandText = this.query.slice(0, -1);
        const newText = beforeSlash + "/" + newCommandText + afterCursor;

        // Update text
        node.updateText(newText);

        // Update cursor position
        const newOffset = this.commandStartOffset + 1 + newCommandText.length;
        cursor.offset = newOffset;
        this.commandCursorOffset = newOffset;

        // Update query
        this.query = newCommandText;
        this.selectedIndex = 0;

        // Apply cursor
        cursor.applyToStore();

        // Update position
        const pos = this.getCursorScreenPosition();
        if (pos) this.updatePosition(pos);
    }

    move(delta: number) {
        const len = this.visible.length;
        if (len === 0) return;
        this.selectedIndex = (this.selectedIndex + delta + len) % len;
    }

    confirm() {
        const list = this.visible;
        const cmd = list[this.selectedIndex];
        try {
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                logger.debug(
                    "[CommandPaletteStore.confirm] selectedIndex=",
                    this.selectedIndex,
                    "visible=",
                    list.map(c => c.label),
                );
            }
        } catch (_e) {
            logger.error(_e);
        }
        if (cmd) {
            try {
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug("[CommandPaletteStore.confirm] confirming type=", cmd.type);
                }
            } catch (_e) {
                logger.error(_e);
            }
            this.insert(cmd.type);
        } else {
            try {
                logger.warn("[CommandPaletteStore.confirm] no command at selectedIndex");
            } catch (_e) {
                logger.error(_e);
            }
        }
        this.hide();
    }

    updatePosition(pos: Position) {
        this.position = pos;
    }

    getCursorScreenPosition(): Position | null {
        const cursors = editorOverlayStore.getCursorInstances();
        if (cursors.length === 0) return null;
        const cursor = cursors[0];
        const itemEl = document.querySelector(
            `.outliner-item[data-item-id="${cursor.itemId}"] .item-text`,
        ) as HTMLElement | null;
        if (!itemEl) return null;
        const textNode = Array.from(itemEl.childNodes).find(
            n => n.nodeType === Node.TEXT_NODE,
        ) as Text | undefined;
        const range = document.createRange();
        const offset = Math.min(cursor.offset, textNode?.textContent?.length ?? 0);
        range.setStart(textNode || itemEl, offset);
        range.collapse(true);
        const rect = range.getClientRects()[0] || itemEl.getBoundingClientRect();
        return { top: rect.bottom + 4, left: rect.left };
    }

    insert(type: CommandType) {
        const cursors = editorOverlayStore.getCursorInstances();
        const cursor = cursors.length > 0 ? cursors[0] : null;
        const target = cursor && this.commandCursorItemId ? cursor.findTarget() : undefined;

        // Delete entire command string (including slash). What is left is also
        // what decides whether the node may be replaced: a node holding nothing
        // but the command is safe to discard, one holding user text is not.
        let remainingText = "";
        if (cursor && target) {
            const raw = (target as unknown as { text?: unknown; }).text ?? "";
            const text = typeof raw === "string"
                ? raw
                : ((raw as { toString?: () => string; })?.toString?.() ?? "");
            const safeStartOffset = Math.max(0, Math.min(this.commandStartOffset, text.length));
            const safeCursorOffset = Math.max(0, Math.min(cursor.offset, text.length));
            const beforeSlash = text.slice(0, safeStartOffset);
            const afterCursor = text.slice(safeCursorOffset);

            // Delete slash and command string
            remainingText = beforeSlash + afterCursor;
            target.updateText(remainingText);

            // Return cursor position to slash position
            cursor.offset = safeStartOffset;
            cursor.applyToStore();
        }

        const userId = cursor ? cursor.userId : "local";

        // An alias is an ordinary Text node that mirrors another one, not a
        // visual node kind, so it keeps the plain insert-after behavior.
        if (type === "alias") {
            const aliasItem = insertItemAfterTargetOrAppend(target, userId);
            if (!aliasItem) return;
            aliasItem.updateText("");
            aliasItem.aliasTargetId = undefined;
            try {
                if (typeof window !== "undefined" && window.DEBUG_MODE) {
                    logger.debug("[CommandPaletteStore.insert] showing AliasPicker for new item:", aliasItem.id);
                }
            } catch (_e) {
                logger.error(_e);
            }
            if (aliasItem.id) aliasPickerStore.show(aliasItem.id);
            this.focusCreatedItem(aliasItem.id, cursor, userId);
            return;
        }

        // Creating a visual node is a structural change, never a kind mutation
        // (#5015): an eligible empty Text node is replaced in place, anything
        // else keeps its content and gets the new node as its next sibling.
        const created = createVisualNodeAtTarget(target, remainingText, type, userId);
        if (!created) return;
        const newItem = created.item;

        if (typeof window !== "undefined" && window.DEBUG_MODE) {
            logger.debug(
                "CommandPaletteStore.insert: created",
                type,
                "node",
                newItem.id,
                "by",
                created.placement,
            );
        }

        this.focusCreatedItem(newItem.id, cursor, userId);
    }

    /** Move the caret onto a freshly created node and make it the active item. */
    private focusCreatedItem(
        itemId: string | undefined,
        cursor: { itemId: string; offset: number; applyToStore: () => void; } | null,
        userId: string,
    ) {
        editorOverlayStore.clearCursorAndSelection(userId);
        if (!itemId) return;
        if (cursor) {
            cursor.itemId = itemId;
            cursor.offset = 0;
            cursor.applyToStore();
        } else {
            editorOverlayStore.setCursor({
                itemId,
                offset: 0,
                userId: userId,
                isActive: true,
            });
        }

        editorOverlayStore.setActiveItem(itemId);
        editorOverlayStore.startCursorBlink();
    }
}

export const commandPaletteStore = $state(new CommandPaletteStore());

// expose for debugging and test access without importing .svelte.ts
// The literal MODE comparison lets Rollup drop this assignment from the
// production bundle (see ENV-production-build-leak.test.ts).
if (typeof window !== "undefined" && import.meta.env.MODE !== "production") {
    window.commandPaletteStore = commandPaletteStore;
}
