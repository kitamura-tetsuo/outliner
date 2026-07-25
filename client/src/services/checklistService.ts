import { RRule } from "rrule";
import { get, writable } from "svelte/store";
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
    _parsedRule?: RRule;
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
                    items: l.items.map(it => it.state !== "deleted" ? { ...it, state: "active" as const } : it),
                    lastReset: Date.now(),
                }
                : l
        )
    );
}

export function applyAutoReset(listId: string, now: number = Date.now()): void {
    let changed = false;
    lists.update(arr => {
        const newArr = arr.map(l => {
            if (l.id !== listId || !l.rrule) return l;
            let rule = l._parsedRule;
            if (!rule) {
                rule = RRule.fromString(l.rrule);
            }
            const next = rule.after(new Date(l.lastReset ?? 0));
            if (next && next.getTime() <= now) {
                changed = true;
                return {
                    ...l,
                    _parsedRule: rule,
                    items: l.items.map(it => it.state !== "deleted" ? { ...it, state: "active" as const } : it),
                    lastReset: now,
                };
            }
            if (!l._parsedRule) {
                changed = true;
                return { ...l, _parsedRule: rule };
            }
            return l;
        });
        return changed ? newArr : arr;
    });
}

export function getNextResetDelay(listId: string, now: number = Date.now()): number | null {
    const arr = get(lists);
    const l = arr.find(x => x.id === listId);
    if (!l || !l.rrule) return null;
    let rule = l._parsedRule;
    if (!rule) {
        rule = RRule.fromString(l.rrule);
    }
    const next = rule.after(new Date(l.lastReset ?? 0));
    if (!next) return null;
    return Math.max(0, next.getTime() - now);
}
