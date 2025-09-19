// @ts-nocheck
import type { Item } from "../schema/yjs-schema";
import { Items } from "../schema/yjs-schema";
import { editorOverlayStore as store } from "../stores/EditorOverlayStore.svelte";
import { store as generalStore } from "../stores/store.svelte";
import { ScrapboxFormatter } from "../utils/ScrapboxFormatter";
import { CursorBase } from "./cursor/CursorBase";
import { CursorFormatting } from "./cursor/CursorFormatting";
import { CursorNavigation } from "./cursor/CursorNavigation";
import { CursorSelection } from "./cursor/CursorSelection";
import { CursorTextOperations } from "./cursor/CursorTextOperations";

export function isPageItem(item: Item): boolean {
    const parent = item.parent;
    return !!parent && parent.parentKey === "root";
}

interface CursorOptions {
    itemId: string;
    offset: number;
    isActive: boolean;
    userId: string;
}

export class Cursor extends CursorBase {
    private cursorSelection: CursorSelection;
    private cursorNavigation: CursorNavigation;
    private cursorFormatting: CursorFormatting;
    private cursorTextOperations: CursorTextOperations;

    constructor(cursorId: string, opts: CursorOptions) {
        super(cursorId, opts);

        // Initialize the new specialized classes
        this.cursorSelection = new CursorSelection(this);
        this.cursorNavigation = new CursorNavigation(this);
        this.cursorFormatting = new CursorFormatting(this);
        this.cursorTextOperations = new CursorTextOperations(this);
    }

    // Text operations
    insertText(ch: string) {
        this.cursorTextOperations.insertText(ch);
    }

    deleteBackward() {
        this.cursorTextOperations.deleteBackward();
    }

    deleteForward() {
        this.cursorTextOperations.deleteForward();
    }

    // Navigation operations
    moveLeft() {
        this.cursorNavigation.moveLeft();
    }

    moveRight() {
        this.cursorNavigation.moveRight();
    }

    moveUp() {
        this.cursorNavigation.moveUp();
    }

    moveDown() {
        this.cursorNavigation.moveDown();
    }

    // Selection operations
    clearSelection() {
        this.cursorSelection.clearSelection();
    }

    extendSelectionLeft() {
        this.cursorSelection.extendSelectionLeft();
    }

    extendSelectionRight() {
        this.cursorSelection.extendSelectionRight();
    }

    extendSelectionUp() {
        this.cursorSelection.extendSelectionUp();
    }

    extendSelectionDown() {
        this.cursorSelection.extendSelectionDown();
    }

    moveToLineStart() {
        this.cursorSelection.moveToLineStart();
    }

    moveToLineEnd() {
        this.cursorSelection.moveToLineEnd();
    }

    extendSelectionToLineStart() {
        this.cursorSelection.extendSelectionToLineStart();
    }

    extendSelectionToLineEnd() {
        this.cursorSelection.extendSelectionToLineEnd();
    }

    // Formatting operations
    formatBold() {
        this.cursorFormatting.formatBold();
    }

    formatItalic() {
        this.cursorFormatting.formatItalic();
    }

    formatUnderline() {
        this.cursorFormatting.formatUnderline();
    }

    formatStrikethrough() {
        this.cursorFormatting.formatStrikethrough();
    }

    formatCode() {
        this.cursorFormatting.formatCode();
    }
}
