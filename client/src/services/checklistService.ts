import { RRule } from "rrule";
import { writable } from "svelte/store";
import { v4 as uuidv4 } from "uuid";

export type ChecklistItemState = "active" | "checked" | "archived" | "deleted";

export interface ChecklistItem {
    id: string;
    label: string;
    state: ChecklistItemState;
}

export type ChecklistMode = "shopping" | "packing" | "habit" | "custom";

export interface Checklist {
    id: string;
    title: string;
    mode: ChecklistMode;
    rrule?: string;
    lastReset?: number;
    items: ChecklistItem[];
}

const lists = writable<Checklist[]>([]);

export const checklists = {
    subscribe: lists.subscribe,
};

export function createChecklist(
    title: string,
    mode: ChecklistMode = "custom",
    rrule?: string,
): string {
    const id = uuidv4();
    const checklist: Checklist = {
        id,
        title,
        mode,
        rrule,
        lastReset: Date.now(),
        items: [],
    };
    lists.update(arr => [...arr, checklist]);
    return id;
}

export function addItem(listId: string, label: string): string {
    const item: ChecklistItem = { id: uuidv4(), label, state: "active" };
    lists.update(arr => arr.map(l => (l.id === listId ? { ...l, items: [...l.items, item] } : l)));
    return item.id;
}

export function toggleItem(listId: string, itemId: string): void {
    lists.update(arr =>
        arr.map(l => {
            if (l.id !== listId) return l;
            const mode = l.mode;
            return {
                ...l,
                items: l.items.map(it => {
                    if (it.id !== itemId) return it;
                    if (mode === "shopping") {
                        return {
                            ...it,
                            state: it.state === "archived" ? "active" : "archived",
                        };
                    }
                    return {
                        ...it,
                        state: it.state === "checked" ? "active" : "checked",
                    };
                }),
            };
        })
    );
}

export function resetChecklist(listId: string): void {
    lists.update(arr =>
        arr.map(l =>
            l.id === listId
                ? {
                    ...l,
                    items: l.items.map(it => it.state !== "deleted" ? { ...it, state: "active" } : it),
                    lastReset: Date.now(),
                }
                : l
        )
    );
}

export function applyAutoReset(listId: string, now: number = Date.now()): void {
    lists.update(arr =>
        arr.map(l => {
            if (l.id !== listId || !l.rrule) return l;
            const rule = RRule.fromString(l.rrule);
            const next = rule.after(new Date(l.lastReset ?? 0));
            if (next && next.getTime() <= now) {
                return {
                    ...l,
                    items: l.items.map(it => it.state !== "deleted" ? { ...it, state: "active" } : it),
                    lastReset: now,
                };
            }
            return l;
        })
    );
}
