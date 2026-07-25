import { beforeEach, describe, expect, it } from "vitest";
import {
    addItem,
    applyAutoReset,
    checklistsState,
    createChecklist,
    resetChecklist,
    resetServiceForTests,
    toggleItem,
} from "../services/checklistService.svelte";

describe("checklistService", () => {
    beforeEach(() => {
        resetServiceForTests();
    });

    it("creates checklist and adds items", () => {
        const id = createChecklist("test-id", "test", "packing");
        addItem(id, "milk");
        const list = checklistsState.lists.find(l => l.id === id)!;
        expect(list.items[0].label).toBe("milk");
        expect(list.items[0].state).toBe("active");
    });

    it("toggles and resets items", () => {
        const id = createChecklist("test-id-2", "test2", "shopping");
        const itemId = addItem(id, "eggs");
        toggleItem(id, itemId);
        let list = checklistsState.lists.find(l => l.id === id)!;
        expect(list.items[0].state).toBe("archived");
        resetChecklist(id);
        list = checklistsState.lists.find(l => l.id === id)!;
        expect(list.items[0].state).toBe("active");
    });

    it("auto resets based on rrule", () => {
        const id = createChecklist("test-id-3", "habit", "habit", "FREQ=DAILY");
        addItem(id, "water");
        toggleItem(id, checklistsState.lists.find(l => l.id === id)!.items[0].id);
        applyAutoReset(id, Date.now() + 24 * 60 * 60 * 1000);
        const list = checklistsState.lists.find(l => l.id === id)!;
        expect(list.items[0].state).toBe("active");
    });
});
