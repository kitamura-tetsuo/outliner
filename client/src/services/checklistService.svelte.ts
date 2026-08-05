import { RRule } from "rrule";
import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";
import { yjsStore } from "../stores/yjsStore.svelte";

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

class ChecklistService {
    lists = $state<Checklist[]>([]);
    private ydoc: Y.Doc | null = null;
    private ymap: Y.Map<unknown> | null = null;
    private observer: ((events: Y.YEvent<Y.AbstractType<unknown>>[], transaction: Y.Transaction) => void) | null = null;

    // ensureBound will bind to the active document dynamically if one exists
    ensureBound() {
        // Find the current ydoc
        const doc = yjsStore.yjsClient?.getProject()?.ydoc
            || (globalThis as unknown as { generalStore?: { project?: { ydoc?: Y.Doc; }; }; }).generalStore?.project
                ?.ydoc;

        if (doc && this.ydoc !== doc) {
            this.unbind();
            this.ydoc = doc;
            this.ymap = doc.getMap("checklists");

            this.observer = (events: Y.YEvent<Y.AbstractType<unknown>>[], transaction: Y.Transaction) => {
                if (transaction.origin !== this) {
                    this.syncFromYjs();
                }
            };
            this.ymap!.observeDeep(this.observer);
            this.syncFromYjs();
        }
    }

    unbind() {
        if (this.ymap && this.observer) {
            this.ymap.unobserveDeep(this.observer);
        }
        this.ydoc = null;
        this.ymap = null;
        this.observer = null;
    }

    reset() {
        this.unbind();
        this.lists = [];
    }

    private syncFromYjs() {
        if (!this.ymap) return;

        const newLists: Checklist[] = [];
        for (const [key, ylist] of this.ymap.entries()) {
            if (ylist instanceof Y.Map) {
                const yitems = ylist.get("items");
                let items: ChecklistItem[] = [];
                if (yitems instanceof Y.Array) {
                    items = yitems.toArray().map((yitem: unknown) => {
                        if (yitem instanceof Y.Map) {
                            return {
                                id: yitem.get("id") as string,
                                label: yitem.get("label") as string,
                                state: yitem.get("state") as ChecklistItemState,
                            };
                        }
                        return null;
                    }).filter(Boolean) as ChecklistItem[];
                }

                newLists.push({
                    id: key,
                    title: ylist.get("title") as string,
                    mode: ylist.get("mode") as ChecklistMode,
                    rrule: ylist.get("rrule") as string | undefined,
                    lastReset: ylist.get("lastReset") as number | undefined,
                    items,
                });
            }
        }
        this.lists = newLists;
    }

    createChecklist(
        title: string,
        mode: ChecklistMode = "custom",
        rrule?: string,
        id: string = uuidv4(),
    ): string {
        this.ensureBound();

        if (this.ymap && this.ydoc) {
            // Only create if it doesn't exist
            if (!this.ymap.has(id)) {
                this.ydoc.transact(() => {
                    const ylist = new Y.Map();
                    ylist.set("title", title);
                    ylist.set("mode", mode);
                    if (rrule) ylist.set("rrule", rrule);
                    ylist.set("lastReset", Date.now());
                    ylist.set("items", new Y.Array());
                    this.ymap!.set(id, ylist);
                }, this);
                this.syncFromYjs();
            }
        } else {
            // Local fallback
            if (!this.lists.find(l => l.id === id)) {
                const checklist: Checklist = {
                    id,
                    title,
                    mode,
                    rrule,
                    lastReset: Date.now(),
                    items: [],
                };
                this.lists = [...this.lists, checklist];
            }
        }

        return id;
    }

    addItem(listId: string, label: string): string {
        this.ensureBound();
        const itemId = uuidv4();

        if (this.ymap && this.ydoc) {
            this.ydoc.transact(() => {
                const ylist = this.ymap!.get(listId);
                if (ylist instanceof Y.Map) {
                    const yitems = ylist.get("items");
                    if (yitems instanceof Y.Array) {
                        const yitem = new Y.Map();
                        yitem.set("id", itemId);
                        yitem.set("label", label);
                        yitem.set("state", "active");
                        yitems.push([yitem]);
                    }
                }
            }, this);
            this.syncFromYjs();
        } else {
            this.lists = this.lists.map(l =>
                l.id === listId ? { ...l, items: [...l.items, { id: itemId, label, state: "active" }] } : l
            );
        }
        return itemId;
    }

    toggleItem(listId: string, itemId: string): void {
        this.ensureBound();

        if (this.ymap && this.ydoc) {
            this.ydoc.transact(() => {
                const ylist = this.ymap!.get(listId);
                if (ylist instanceof Y.Map) {
                    const mode = ylist.get("mode") as ChecklistMode;
                    const yitems = ylist.get("items");
                    if (yitems instanceof Y.Array) {
                        for (let i = 0; i < yitems.length; i++) {
                            const yitem = yitems.get(i);
                            if (yitem instanceof Y.Map && yitem.get("id") === itemId) {
                                const currentState = yitem.get("state");
                                if (mode === "shopping") {
                                    yitem.set("state", currentState === "archived" ? "active" : "archived");
                                } else {
                                    yitem.set("state", currentState === "checked" ? "active" : "checked");
                                }
                                break;
                            }
                        }
                    }
                }
            }, this);
            this.syncFromYjs();
        } else {
            this.lists = this.lists.map(l => {
                if (l.id !== listId) return l;
                const mode = l.mode;
                return {
                    ...l,
                    items: l.items.map(it => {
                        if (it.id !== itemId) return it;
                        if (mode === "shopping") {
                            return { ...it, state: it.state === "archived" ? "active" : "archived" };
                        }
                        return { ...it, state: it.state === "checked" ? "active" : "checked" };
                    }),
                };
            });
        }
    }

    resetChecklist(listId: string): void {
        this.ensureBound();

        if (this.ymap && this.ydoc) {
            this.ydoc.transact(() => {
                const ylist = this.ymap!.get(listId);
                if (ylist instanceof Y.Map) {
                    ylist.set("lastReset", Date.now());
                    const yitems = ylist.get("items");
                    if (yitems instanceof Y.Array) {
                        for (let i = 0; i < yitems.length; i++) {
                            const yitem = yitems.get(i);
                            if (yitem instanceof Y.Map && yitem.get("state") !== "deleted") {
                                yitem.set("state", "active");
                            }
                        }
                    }
                }
            }, this);
            this.syncFromYjs();
        } else {
            this.lists = this.lists.map(l =>
                l.id === listId
                    ? {
                        ...l,
                        items: l.items.map(it => it.state !== "deleted" ? { ...it, state: "active" as const } : it),
                        lastReset: Date.now(),
                    }
                    : l
            );
        }
    }

    applyAutoReset(listId: string, now: number = Date.now()): void {
        this.ensureBound();

        let changed = false;

        if (this.ymap && this.ydoc) {
            this.ydoc.transact(() => {
                const ylist = this.ymap!.get(listId);
                if (ylist instanceof Y.Map) {
                    const rruleStr = ylist.get("rrule");
                    if (!rruleStr) return;

                    const rule = RRule.fromString(rruleStr as string);
                    const lastReset = ylist.get("lastReset") as number || 0;
                    const next = rule.after(new Date(lastReset));

                    if (next && next.getTime() <= now) {
                        changed = true;
                        ylist.set("lastReset", now);
                        const yitems = ylist.get("items");
                        if (yitems instanceof Y.Array) {
                            for (let i = 0; i < yitems.length; i++) {
                                const yitem = yitems.get(i);
                                if (yitem instanceof Y.Map && yitem.get("state") !== "deleted") {
                                    yitem.set("state", "active");
                                }
                            }
                        }
                    }
                }
            }, this);
            if (changed) this.syncFromYjs();

            // Still need to update the _parsedRule in the local mirror cache for performance
            this.lists = this.lists.map(l => {
                if (l.id !== listId || !l.rrule) return l;
                let rule = l._parsedRule;
                if (!rule) {
                    rule = RRule.fromString(l.rrule);
                }
                return { ...l, _parsedRule: rule };
            });
        } else {
            let changedLocal = false;
            const newArr = this.lists.map(l => {
                if (l.id !== listId || !l.rrule) return l;
                let rule = l._parsedRule;
                if (!rule) {
                    rule = RRule.fromString(l.rrule);
                }
                const next = rule.after(new Date(l.lastReset ?? 0));
                if (next && next.getTime() <= now) {
                    changedLocal = true;
                    return {
                        ...l,
                        _parsedRule: rule,
                        items: l.items.map(it => it.state !== "deleted" ? { ...it, state: "active" as const } : it),
                        lastReset: now,
                    };
                }
                if (!l._parsedRule) {
                    changedLocal = true;
                    return { ...l, _parsedRule: rule };
                }
                return l;
            });
            if (changedLocal) this.lists = newArr;
        }
    }

    getNextResetDelay(listId: string, now: number = Date.now()): number | null {
        const l = this.lists.find(x => x.id === listId);
        if (!l || !l.rrule) return null;
        let rule = l._parsedRule;
        if (!rule) {
            rule = RRule.fromString(l.rrule);
        }
        const next = rule.after(new Date(l.lastReset ?? 0));
        if (!next) return null;
        return Math.max(0, next.getTime() - now);
    }
}

export const checklistService = new ChecklistService();

export const createChecklist = checklistService.createChecklist.bind(checklistService);
export const addItem = checklistService.addItem.bind(checklistService);
export const toggleItem = checklistService.toggleItem.bind(checklistService);
export const resetChecklist = checklistService.resetChecklist.bind(checklistService);
export const applyAutoReset = checklistService.applyAutoReset.bind(checklistService);
export const getNextResetDelay = checklistService.getNextResetDelay.bind(checklistService);
