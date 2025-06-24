import { editorOverlayStore } from "./EditorOverlayStore.svelte";
import { Items } from "../schema/app-schema";
import { Tree } from "fluid-framework";

export type CommandType = "table" | "chart";

interface Position { top: number; left: number; }

class CommandPaletteStore {
    isVisible = $state(false);
    position = $state<Position>({ top: 0, left: 0 });

    show(pos: Position) {
        this.position = pos;
        this.isVisible = true;
    }

    hide() {
        this.isVisible = false;
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
