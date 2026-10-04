import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    addItem,
    applyAutoReset,
    checklistService,
    createChecklist,
    resetChecklist,
    toggleItem,
} from "../services/checklistService.svelte";

describe("checklistService", () => {
    beforeEach(() => {
        checklistService.reset();
    });

    it("creates checklist and adds items", () => {
        const id = createChecklist("test", "packing");
        addItem(id, "milk");
        const data = checklistService.lists;
        const list = data.find(l => l.id === id)!;
        expect(list.items[0].label).toBe("milk");
        expect(list.items[0].state).toBe("active");
    });

    it("toggles and resets items", () => {
        const id = createChecklist("test2", "shopping");
        const itemId = addItem(id, "eggs");
        toggleItem(id, itemId);
        let list = checklistService.lists.find(l => l.id === id)!;
        expect(list.items[0].state).toBe("archived");
        resetChecklist(id);
        list = checklistService.lists.find(l => l.id === id)!;
        expect(list.items[0].state).toBe("active");
    });

    it("auto resets based on rrule", () => {
        const id = createChecklist("habit", "habit", "FREQ=DAILY");
        addItem(id, "water");
        toggleItem(id, checklistService.lists.find(l => l.id === id)!.items[0].id);
        applyAutoReset(id, Date.now() + 24 * 60 * 60 * 1000);
        const list = checklistService.lists.find(l => l.id === id)!;
        expect(list.items[0].state).toBe("active");
    });

    it("does not change store identity if boundary not reached", () => {
        const id = createChecklist("noop", "custom", "FREQ=DAILY");

        // Seed the cache so the initial run caches the parsed rule.
        applyAutoReset(id, Date.now());

        const before = checklistService.lists;
        applyAutoReset(id, Date.now()); // Second call should be a no-op
        const after = checklistService.lists;

        expect(before).toStrictEqual(after);
    });

    it("anchors recurrence boundaries to last reset, not rule parse time", () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(new Date("2026-01-05T09:00:00.500Z"));
            const id = createChecklist("anchored", "custom", "FREQ=DAILY");
            const list = () => checklistService.lists.find(l => l.id === id)!;
            const created = list().lastReset!;

            // Cross a second boundary before the first boundary check, then
            // check 700ms after creation: the daily boundary is far away.
            vi.setSystemTime(new Date("2026-01-05T09:00:01.200Z"));
            applyAutoReset(id, Date.now());
            expect(list().lastReset).toBe(created);

            // A repeated check at the same instant is a strict no-op.
            const before = checklistService.lists;
            applyAutoReset(id, Date.now());
            expect(checklistService.lists).toBe(before);
        } finally {
            vi.useRealTimers();
        }
    });
});
