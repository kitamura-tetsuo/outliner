import { RRule } from "rrule";
import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";
import { Project } from "../schema/app-schema";
import { store } from "../stores/store.svelte";

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

export const checklistsState = $state<{ lists: Checklist[]; }>({ lists: [] });

let currentYDoc: Y.Doc | null = null;
let observer: ((events: Y.YEvent<unknown>[], transaction: Y.Transaction) => void) | null = null;

function syncMirror() {
    if (!currentYDoc) {
        checklistsState.lists = [];
        return;
    }
    const checklistsMap = currentYDoc.getMap<Y.Map<unknown>>("checklists");

    const newLists: Checklist[] = [];
    for (const [id, ymap] of checklistsMap.entries()) {
        if (ymap instanceof Y.Map) {
            const title = ymap.get("title") as string;
            const mode = ymap.get("mode") as ChecklistMode;
            const rrule = ymap.get("rrule") as string | undefined;
            const lastReset = ymap.get("lastReset") as number | undefined;
            const yitems = ymap.get("items") as Y.Array<Y.Map<unknown>> | undefined;

            const items: ChecklistItem[] = [];
            if (yitems) {
                for (const yitem of yitems.toArray()) {
                    if (yitem instanceof Y.Map) {
                        items.push({
                            id: yitem.get("id") as string,
                            label: yitem.get("label") as string,
                            state: yitem.get("state") as ChecklistItemState,
                        });
                    }
                }
            }

            newLists.push({ id, title, mode, rrule, lastReset, items });
        }
    }
    checklistsState.lists = newLists;
}

// Module-level root effect to keep mirror in sync with active project
const _cleanupRoot = $effect.root(() => {
    $effect(() => {
        const ydoc = store.project?.ydoc || null;
        if (currentYDoc !== ydoc) {
            if (currentYDoc && observer) {
                const oldMap = currentYDoc.getMap("checklists");
                oldMap.unobserveDeep(observer);
            }

            currentYDoc = ydoc;

            if (currentYDoc) {
                const newMap = currentYDoc.getMap("checklists");
                observer = (_events, _tr) => {
                    syncMirror();
                };
                newMap.observeDeep(observer);
            }
            syncMirror();
        }
    });
});

export function createChecklist(
    id: string,
    title: string,
    mode: ChecklistMode = "custom",
    rrule?: string,
): string {
    const ydoc = store.project?.ydoc;
    if (!ydoc) return id;

    const checklistsMap = ydoc.getMap<Y.Map<unknown>>("checklists");

    ydoc.transact(() => {
        if (!checklistsMap.has(id)) {
            const ymap = new Y.Map<unknown>();
            ymap.set("title", title);
            ymap.set("mode", mode);
            if (rrule) ymap.set("rrule", rrule);
            ymap.set("lastReset", Date.now());

            const yitems = new Y.Array<Y.Map<unknown>>();
            ymap.set("items", yitems);

            checklistsMap.set(id, ymap);
        }
    });

    return id;
}

export function addItem(listId: string, label: string): string {
    const ydoc = store.project?.ydoc;
    if (!ydoc) return "";
    const checklistsMap = ydoc.getMap<Y.Map<unknown>>("checklists");
    const ymap = checklistsMap.get(listId);
    if (!ymap) return "";

    const yitems = ymap.get("items") as Y.Array<Y.Map<unknown>> | undefined;
    if (!yitems) return "";

    const itemId = uuidv4();
    ydoc.transact(() => {
        const itemMap = new Y.Map<unknown>();
        itemMap.set("id", itemId);
        itemMap.set("label", label);
        itemMap.set("state", "active");
        yitems.push([itemMap]);
    });

    return itemId;
}

export function toggleItem(listId: string, itemId: string): void {
    const ydoc = store.project?.ydoc;
    if (!ydoc) return;
    const checklistsMap = ydoc.getMap<Y.Map<unknown>>("checklists");
    const ymap = checklistsMap.get(listId);
    if (!ymap) return;

    const mode = ymap.get("mode") as string;
    const yitems = ymap.get("items") as Y.Array<Y.Map<unknown>> | undefined;
    if (!yitems) return;

    ydoc.transact(() => {
        for (const yitem of yitems.toArray()) {
            if (yitem instanceof Y.Map && yitem.get("id") === itemId) {
                const currentState = yitem.get("state") as string;
                if (mode === "shopping") {
                    yitem.set("state", currentState === "archived" ? "active" : "archived");
                } else {
                    yitem.set("state", currentState === "checked" ? "active" : "checked");
                }
                break;
            }
        }
    });
}

export function resetChecklist(listId: string): void {
    const ydoc = store.project?.ydoc;
    if (!ydoc) return;
    const checklistsMap = ydoc.getMap<Y.Map<unknown>>("checklists");
    const ymap = checklistsMap.get(listId);
    if (!ymap) return;

    ydoc.transact(() => {
        const yitems = ymap.get("items") as Y.Array<Y.Map<unknown>> | undefined;
        if (yitems) {
            for (const yitem of yitems.toArray()) {
                if (yitem instanceof Y.Map) {
                    const state = yitem.get("state") as string;
                    if (state !== "deleted") {
                        yitem.set("state", "active");
                    }
                }
            }
        }
        ymap.set("lastReset", Date.now());
    });
}

export function applyAutoReset(listId: string, now: number = Date.now()): void {
    const ydoc = store.project?.ydoc;
    if (!ydoc) return;
    const checklistsMap = ydoc.getMap<Y.Map<unknown>>("checklists");
    const ymap = checklistsMap.get(listId);
    if (!ymap) return;

    const rrule = ymap.get("rrule") as string | undefined;
    if (!rrule) return;

    const lastReset = ymap.get("lastReset") as number | undefined;
    const rule = RRule.fromString(rrule);
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const next = rule.after(new Date(lastReset ?? 0));

    if (next && next.getTime() <= now) {
        ydoc.transact(() => {
            const yitems = ymap.get("items") as Y.Array<Y.Map<unknown>> | undefined;
            if (yitems) {
                for (const yitem of yitems.toArray()) {
                    if (yitem instanceof Y.Map) {
                        const state = yitem.get("state") as string;
                        if (state !== "deleted") {
                            yitem.set("state", "active");
                        }
                    }
                }
            }
            ymap.set("lastReset", now);
        });
    }
}

export function resetServiceForTests(): void {
    checklistsState.lists = [];
    if (!store.project) {
        store.project = Project.createInstance("Test Project");
    } else {
        const ydoc = store.project.ydoc;
        const checklistsMap = ydoc.getMap<Y.Map<unknown>>("checklists");
        ydoc.transact(() => {
            for (const key of Array.from(checklistsMap.keys())) {
                checklistsMap.delete(key);
            }
        });
    }
    syncMirror();
}
