import { describe, expect, it, beforeEach } from "vitest";
import * as Y from "yjs";
import {
    addItem,
    applyAutoReset,
    checklistsState,
    createChecklist,
    resetChecklist,
    toggleItem,
    initChecklistSync,
} from "../services/checklistService.svelte";

describe("checklistService", () => {
    let ydoc: Y.Doc;

    beforeEach(() => {
        ydoc = new Y.Doc();
        initChecklistSync(ydoc);
    });

    it("creates checklist and adds items", () => {
        const id = createChecklist("test", "packing");
        addItem(id, "milk");
        const list = checklistsState[id];
        expect(list.items[0].label).toBe("milk");
        expect(list.items[0].state).toBe("active");
    });

    it("toggles and resets items", () => {
        const id = createChecklist("test2", "shopping");
        const itemId = addItem(id, "eggs");
        toggleItem(id, itemId);
        let list = checklistsState[id];
        expect(list.items[0].state).toBe("archived");
        resetChecklist(id);
        list = checklistsState[id];
        expect(list.items[0].state).toBe("active");
    });

    it("auto resets based on rrule", () => {
        const id = createChecklist("habit", "habit", "FREQ=DAILY");
        const itemId = addItem(id, "water");
        toggleItem(id, itemId);
        applyAutoReset(id, Date.now() + 24 * 60 * 60 * 1000);
        const list = checklistsState[id];
        expect(list.items[0].state).toBe("active");
    });
});
