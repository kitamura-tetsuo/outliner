import * as Y from "yjs";

type Kind = "table" | "grid" | "schedule" | "calendar";
const registries = { table: "yjsTables", grid: "yjsGrids", schedule: "schedules", calendar: "calendars" } as const;
const fields = {
    table: ["sqlName", "sourceProjectId", "sourceTableId", "doc"],
    grid: ["query", "insertTargetTableId", "copiedFromProjectId", "copiedFromGridId"],
    schedule: ["targetTableId", "sql"],
    calendar: ["query"],
} as const;

interface Binding {
    kind: Kind;
    id: string;
    owned: boolean;
    entry: Y.Map<unknown>;
    facts: ReadonlyArray<readonly [string, unknown]>;
}

/** Transient evidence produced by this transfer's allocations/reuse decisions.
 * IDs remap payloads; these witnesses authorize later effects. Never persisted. */
export class TransferBindings {
    private bindings: Binding[] = [];

    constructor(readonly doc: Y.Doc, private readonly assertAdmission?: () => void) {}

    capture(kind: Kind, id: string, owned: boolean, entry = this.registry(kind).get(id)): void {
        if (!entry) throw new Error(`Destination ${kind} binding is unavailable`);
        const binding: Binding = {
            kind,
            id,
            owned,
            entry,
            facts: fields[kind].map(key => [key, entry.get(key)] as const),
        };
        const index = this.bindings.findIndex(item => item.kind === kind && item.id === id);
        if (index < 0) this.bindings.push(binding);
        else this.bindings[index] = binding;
    }

    /** Calendar definitions retain their separate existing history handling. */
    forComposite(): TransferBindings {
        const evidence = new TransferBindings(this.doc, this.assertAdmission);
        evidence.bindings = this.bindings.filter(binding => binding.kind !== "calendar");
        return evidence;
    }

    ownedIds(kind: Kind): string[] {
        return this.bindings.filter(binding => binding.kind === kind && binding.owned).map(binding => binding.id);
    }

    private registry(kind: Kind): Y.Map<Y.Map<unknown>> {
        return this.doc.getMap(registries[kind]);
    }

    private owns(binding: Binding): boolean {
        return this.registry(binding.kind).get(binding.id) === binding.entry
            && (binding.kind !== "table"
                || binding.entry.get("doc") === binding.facts.find(([key]) => key === "doc")?.[1]);
    }

    private current(binding: Binding): boolean {
        return this.owns(binding) && binding.facts.every(([key, value]) => binding.entry.get(key) === value);
    }

    /** Pending commit requires the exact identity and mapping accepted by planning. */
    assertCurrent(): void {
        this.assertAdmission?.();
        if (this.bindings.some(binding => !this.current(binding))) {
            throw new Error("A destination binding changed during preparation");
        }
    }

    /** User Undo is atomic across owned objects. In-place content edits are allowed. */
    assertOwned(): void {
        if (this.bindings.some(binding => binding.owned && !this.owns(binding))) {
            throw new Error("A pasted object is missing or has a newer incarnation");
        }
    }

    assertReplayAvailable(): void {
        this.assertAdmission?.();
        const names = new Set<unknown>();
        for (const binding of this.bindings) {
            if (!binding.owned) {
                if (!this.current(binding)) throw new Error("A reused destination binding changed before replay");
                continue;
            }
            if (this.registry(binding.kind).has(binding.id)) {
                throw new Error("A destination identity is already occupied");
            }
            if (binding.kind !== "table") continue;
            const name = binding.facts.find(([key]) => key === "sqlName")?.[1];
            if (typeof name !== "string") continue;
            if (names.has(name) || [...this.registry("table").values()].some(entry => entry.get("sqlName") === name)) {
                throw new Error(`Destination SQL relation "${name}" is already occupied`);
            }
            names.add(name);
        }
    }

    discardAllocation(kind: Kind, id: string, removeTable: (id: string) => void): void {
        const binding = this.bindings.find(item => item.kind === kind && item.id === id);
        if (binding?.owned && this.owns(binding)) {
            if (kind === "table") removeTable(id);
            else this.registry(kind).delete(id);
        }
        this.bindings = this.bindings.filter(item => item !== binding);
    }

    /** Failure cleanup is selective; user Undo must call assertOwned first. */
    cleanupOwned(removeTable: (id: string) => void): void {
        for (const binding of this.bindings) {
            if (!binding.owned || !this.owns(binding)) continue;
            if (binding.kind === "table") removeTable(binding.id);
            else this.registry(binding.kind).delete(binding.id);
        }
    }
}
