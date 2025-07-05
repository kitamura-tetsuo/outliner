import { get } from "svelte/store";
import { describe, expect, it } from "vitest";
import {
    addItem,
    applyAutoReset,
    checklists,
    createChecklist,
    resetChecklist,
    toggleItem,
} from "../services/checklistService";

describe("checklistService", () => {
    it("creates checklist and adds items", () => {
        const id = createChecklist("test", "packing");
        addItem(id, "milk");
        const data = get(checklists);
        const list = data.find(l => l.id === id)!;
        expect(list.items[0].label).toBe("milk");
        expect(list.items[0].state).toBe("active");
    });

    it("toggles and resets items", () => {
        const id = createChecklist("test2", "shopping");
        const itemId = addItem(id, "eggs");
        toggleItem(id, itemId);
        let list = get(checklists).find(l => l.id === id)!;
        expect(list.items[0].state).toBe("archived");
        resetChecklist(id);
        list = get(checklists).find(l => l.id === id)!;
        expect(list.items[0].state).toBe("active");
    });

    it("auto resets based on rrule", () => {
        const id = createChecklist("habit", "habit", "FREQ=DAILY");
        addItem(id, "water");
        toggleItem(id, get(checklists).find(l => l.id === id)!.items[0].id);
        applyAutoReset(id, Date.now() + 24 * 60 * 60 * 1000);
        const list = get(checklists).find(l => l.id === id)!;
        expect(list.items[0].state).toBe("active");
    });
});
