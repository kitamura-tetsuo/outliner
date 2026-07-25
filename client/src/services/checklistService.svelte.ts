import { RRule } from "rrule";
import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";

/**
 * Type for Checklist Y.Map values
 */
export type ChecklistValueType = string | number | Y.Array<Y.Map<ChecklistItemValueType>> | undefined;
export type ChecklistItemValueType = string | undefined;

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

export const checklistsState: Record<string, Checklist> = $state({});

let currentYDoc: Y.Doc | undefined;
let checklistsMap: Y.Map<Y.Map<ChecklistValueType>> | undefined;

function mapYjsToChecklist(yChecklist: Y.Map<ChecklistValueType>): Checklist {
    const id = yChecklist.get("id") as string;
    const title = (yChecklist.get("title") as string) || "Untitled Checklist";
    const mode = (yChecklist.get("mode") as ChecklistMode) || "custom";
    const rrule = yChecklist.get("rrule") as string | undefined;
    const lastReset = yChecklist.get("lastReset") as number | undefined;

    let _parsedRule: RRule | undefined;
    if (rrule) {
        try {
            _parsedRule = RRule.fromString(rrule);
        } catch {
            // ignore parse errors
        }
    }

    const items: ChecklistItem[] = [];
    const yItems = yChecklist.get("items") as Y.Array<Y.Map<ChecklistItemValueType>>;
    if (yItems) {
        for (const yItem of yItems.toArray()) {
            items.push({
                id: yItem.get("id") as string,
                label: yItem.get("label") as string,
                state: (yItem.get("state") as ChecklistItemState) || "active",
            });
        }
    }

    return {
        id,
        title,
        mode,
        rrule,
        _parsedRule,
        lastReset,
        items,
    };
}

function syncToState() {
    if (!checklistsMap) return;

    // Clear and rebuild state
    // To be efficient, we can iterate and assign
    const newState: Record<string, Checklist> = {};
    for (const [id, yChecklist] of checklistsMap.entries()) {
        newState[id] = mapYjsToChecklist(yChecklist);
    }

    // Update the reactive state
    for (const key of Object.keys(checklistsState)) {
        if (!(key in newState)) {
            delete checklistsState[key];
        }
    }
    for (const [key, value] of Object.entries(newState)) {
        checklistsState[key] = value;
    }
}

let observer: ((events: Y.YEvent<any>[], transaction: Y.Transaction) => void) | undefined;

export function initChecklistSync(ydoc: Y.Doc | undefined) {
    if (currentYDoc === ydoc) return;

    if (checklistsMap && observer) {
        checklistsMap.unobserveDeep(observer);
    }

    currentYDoc = ydoc;
    if (!ydoc) {
        checklistsMap = undefined;
        // Clear state
        for (const key of Object.keys(checklistsState)) {
            delete checklistsState[key];
        }
        return;
    }

    checklistsMap = ydoc.getMap("checklists");

    observer = (_events, _transaction) => {
        syncToState();
    };

    checklistsMap.observeDeep(observer);
    syncToState();
}

export function createChecklist(
    title: string,
    mode: ChecklistMode = "custom",
    rrule?: string,
    id: string = uuidv4()
): string {
    if (!checklistsMap) return id;

    if (checklistsMap.has(id)) return id;

    const yChecklist = new Y.Map<ChecklistValueType>();
    yChecklist.set("id", id);
    yChecklist.set("title", title);
    yChecklist.set("mode", mode);
    if (rrule) yChecklist.set("rrule", rrule);
    yChecklist.set("lastReset", Date.now());

    const yItems = new Y.Array<Y.Map<ChecklistItemValueType>>();
    yChecklist.set("items", yItems as any);

    checklistsMap.set(id, yChecklist);
    return id;
}

export function addItem(listId: string, label: string): string {
    const id = uuidv4();
    if (!checklistsMap) return id;

    const yChecklist = checklistsMap.get(listId);
    if (!yChecklist) return id;

    const yItems = yChecklist.get("items") as Y.Array<Y.Map<ChecklistItemValueType>>;
    if (!yItems) return id;

    const yItem = new Y.Map<ChecklistItemValueType>();
    yItem.set("id", id);
    yItem.set("label", label);
    yItem.set("state", "active");

    yItems.push([yItem]);
    return id;
}

export function toggleItem(listId: string, itemId: string): void {
    if (!checklistsMap) return;

    const yChecklist = checklistsMap.get(listId);
    if (!yChecklist) return;

    const mode = yChecklist.get("mode") as ChecklistMode;
    const yItems = yChecklist.get("items") as Y.Array<Y.Map<ChecklistItemValueType>>;
    if (!yItems) return;

    for (let i = 0; i < yItems.length; i++) {
        const yItem = yItems.get(i);
        if (yItem.get("id") === itemId) {
            const currentState = yItem.get("state") as ChecklistItemState;
            let newState: ChecklistItemState;
            if (mode === "shopping") {
                newState = currentState === "archived" ? "active" : "archived";
            } else {
                newState = currentState === "checked" ? "active" : "checked";
            }
            yItem.set("state", newState);
            break;
        }
    }
}

export function resetChecklist(listId: string): void {
    if (!checklistsMap) return;

    const yChecklist = checklistsMap.get(listId);
    if (!yChecklist) return;

    yChecklist.set("lastReset", Date.now());

    const yItems = yChecklist.get("items") as Y.Array<Y.Map<ChecklistItemValueType>>;
    if (!yItems) return;

    for (let i = 0; i < yItems.length; i++) {
        const yItem = yItems.get(i);
        if (yItem.get("state") !== "deleted") {
            yItem.set("state", "active");
        }
    }
}

export function applyAutoReset(listId: string, now: number = Date.now()): void {
    if (!checklistsMap) return;

    const yChecklist = checklistsMap.get(listId);
    if (!yChecklist) return;

    const rruleStr = yChecklist.get("rrule") as string | undefined;
    if (!rruleStr) return;

    let rule: RRule;
    try {
        rule = RRule.fromString(rruleStr);
    } catch {
        return;
    }

    const lastReset = yChecklist.get("lastReset") as number | undefined;
    const next = rule.after(new Date(lastReset ?? 0));

    if (next && next.getTime() <= now) {
        yChecklist.set("lastReset", now);

        const yItems = yChecklist.get("items") as Y.Array<Y.Map<ChecklistItemValueType>>;
        if (yItems) {
            for (let i = 0; i < yItems.length; i++) {
                const yItem = yItems.get(i);
                if (yItem.get("state") !== "deleted") {
                    yItem.set("state", "active");
                }
            }
        }
    }
}

export function getNextResetDelay(listId: string, now: number = Date.now()): number | null {
    const l = checklistsState[listId];
    if (!l || !l.rrule) return null;
    let rule = l._parsedRule;
    if (!rule) {
        try {
            rule = RRule.fromString(l.rrule);
        } catch {
            return null;
        }
    }
    const next = rule.after(new Date(l.lastReset ?? 0));
    if (!next) return null;
    return Math.max(0, next.getTime() - now);
}
