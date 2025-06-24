import { editorOverlayStore } from "./EditorOverlayStore.svelte";
import { Items } from "../schema/app-schema";
import { Tree } from "fluid-framework";

export type CommandType = "table" | "chart";

interface Position { top: number; left: number; }

class CommandPaletteStore {
    isVisible = $state(false);
    position = $state<Position>({ top: 0, left: 0 });
    query = $state("");
    selectedIndex = $state(0);

    readonly commands = [
        { label: "Table", type: "table" as const },
        { label: "Chart", type: "chart" as const },
    ];

    get filtered() {
        const q = this.query.toLowerCase();
        return this.commands.filter(c => c.label.toLowerCase().includes(q));
    }

    show(pos: Position) {
        this.position = pos;
        this.query = "";
        this.selectedIndex = 0;
        this.isVisible = true;
    }

    hide() {
        this.isVisible = false;
    }

    updateQuery(q: string) {
        this.query = q;
        this.selectedIndex = 0;
    }

    move(delta: number) {
        const len = this.filtered.length;
        if (len === 0) return;
        this.selectedIndex = (this.selectedIndex + delta + len) % len;
    }

    confirm() {
        const cmd = this.filtered[this.selectedIndex];
        if (cmd) {
            this.insert(cmd.type);
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
            `.outliner-item[data-item-id="${cursor.itemId}"] .item-text`
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
        if (cursors.length === 0) return;
        const cursor = cursors[0];
        cursor.deleteBackward();
        const node = cursor.findTarget();
        if (!node) return;
        const parent = Tree.parent(node);
        if (!parent || !Tree.is(parent, Items)) return;
        const index = parent.indexOf(node);
        const newItem = parent.addNode(cursor.userId, index + 1);
        newItem.updateText(`/${type}`);
        editorOverlayStore.clearCursorAndSelection(cursor.userId);
        cursor.itemId = newItem.id;
        cursor.offset = newItem.text.length;
        editorOverlayStore.setActiveItem(newItem.id);
        cursor.applyToStore();
        editorOverlayStore.startCursorBlink();
    }
}

export const commandPaletteStore = new CommandPaletteStore();

// expose for debugging
if (typeof window !== "undefined") {
    (window as any).commandPaletteStore = commandPaletteStore;
}
