import type { Project } from "$shared/app-schema";
import * as Y from "yjs";

import { collectAllPlacements } from "../objectManager/objectPlacements";

/** Registry effects owned by a Paste are replayed by its composite, not Calendar history. */
export const TRANSFER_REGISTRY_ORIGIN = Symbol("clipboard-transfer-registry");

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

    private placementProject?: Project;
    private placements?: ReturnType<TransferBindings["liveOwnedPlacements"]>;

    private liveOwnedPlacements(project: Project) {
        const all = collectAllPlacements(project);
        return this.bindings.flatMap(binding => {
            if (!binding.owned || (binding.kind !== "grid" && binding.kind !== "calendar")) return [];
            const found = (binding.kind === "grid" ? all.gridPlacements : all.calendarPlacements).get(binding.id) ?? [];
            return found.map(placement => ({
                kind: binding.kind,
                objectId: binding.id,
                pageId: placement.pageId,
                itemId: placement.itemId,
                itemKey: placement.itemKey,
                node: project.tree.getNodeValueFromKey(placement.itemKey),
            }));
        });
    }

    /** Capture only placements added by the immediately following synchronous dispatch. */
    beginPlacementCapture(project: Project): () => void {
        const before = this.liveOwnedPlacements(project);
        this.placementProject = project;
        return () => {
            this.placements = this.liveOwnedPlacements(project).filter(placement =>
                !before.some(previous => previous.node === placement.node && previous.objectId === placement.objectId)
            );
        };
    }

    refreshPlacementsAfterReplay(): void {
        if (this.placementProject) this.placements = this.liveOwnedPlacements(this.placementProject);
    }

    private assertPlacements(): void {
        if (!this.placementProject || !this.placements) return;
        const current = this.liveOwnedPlacements(this.placementProject);
        if (
            current.length !== this.placements.length
            || current.some(placement =>
                !this.placements!.some(expected =>
                    expected.node === placement.node
                    && expected.kind === placement.kind && expected.objectId === placement.objectId
                    && expected.pageId === placement.pageId && expected.itemId === placement.itemId
                    && expected.itemKey === placement.itemKey
                )
            )
        ) throw new Error("A pasted object has changed or additional placements");
    }

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

    /** Keep transfer-owned definitions; unrelated Calendar history stays independent. */
    forComposite(): TransferBindings {
        const evidence = new TransferBindings(this.doc, this.assertAdmission);
        evidence.bindings = this.bindings.filter(binding => binding.kind !== "calendar" || binding.owned);
        evidence.placementProject = this.placementProject;
        evidence.placements = this.placements;
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
        this.assertPlacements();
        if (this.bindings.some(binding => binding.owned && !this.owns(binding))) {
            throw new Error("A pasted object is missing or has a newer incarnation");
        }
    }

    assertReplayAvailable(): void {
        this.assertAdmission?.();
        if (this.placementProject && this.liveOwnedPlacements(this.placementProject).length > 0) {
            throw new Error("A pasted object identity has an existing placement before replay");
        }
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
        this.doc.transact(() => {
            for (const binding of this.bindings) {
                if (!binding.owned || !this.owns(binding)) continue;
                if (binding.kind === "table") removeTable(binding.id);
                else this.registry(binding.kind).delete(binding.id);
            }
        }, TRANSFER_REGISTRY_ORIGIN);
    }
}
