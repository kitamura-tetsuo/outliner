import { cellComponentTypeFor } from "../../components/yjstable/cellComponents";
import { isValueValidForCell } from "./gridSelectionCommands";
import type { KanbanLaneValue, KanbanSettings } from "./kanbanDocs";
import type { KanbanCard, KanbanProjection } from "./kanbanQueryRunner";
import { unambiguousPhysicalColumn } from "./projectQueryProvenance";
import type { RelationResolver } from "./relationRowWrite";
import { applyUnionedRowEdit } from "./relationRowWrite";
import type { ParsedTableSchema } from "./schemaIntrospection";
import type { TableRecordValue } from "./tableDocs";

export type KanbanCardOperationState = "idle" | "pending" | "success" | "refused" | "error";
export interface KanbanCardOperationResult {
    ok: boolean;
    state: Exclude<KanbanCardOperationState, "idle" | "pending">;
    message?: string;
}
interface CardIdentity {
    sourceKind: string;
    sourceId: string;
}
interface PendingOperation {
    token: number;
    definition: string;
    identity: CardIdentity;
    field: string;
    observedValue: unknown;
    schemaRevision?: string;
    destination?: KanbanLaneValue;
}
export interface KanbanCardOperationOptions {
    resolver: RelationResolver;
    schema?: () => ParsedTableSchema | undefined;
    settings: () => KanbanSettings | undefined;
    projection: () => KanbanProjection;
    canWrite: () => boolean;
    beginHistoryAction?: () => void;
    onState?: (state: KanbanCardOperationState, message?: string) => void;
}
export class KanbanCardOperationController {
    private sequence = 0;
    private pending: PendingOperation | undefined;
    constructor(private options: KanbanCardOperationOptions) {}
    begin(card: KanbanCard, field: string, destination?: KanbanLaneValue) {
        const s = this.options.settings(), p = this.options.projection(), id = identityOf(card, p);
        if (
            !s || !id || !p.current || p.status !== "success" || !this.options.canWrite()
            || !columnRoute(p, id.sourceKind, field)
        ) {
            this.refuse("This card is not currently writable.");
            return false;
        }
        if (destination !== undefined && !p.lanes.some(l => Object.is(l.key, destination))) {
            this.refuse("That lane is no longer available.");
            return false;
        }
        this.pending = {
            token: ++this.sequence,
            definition: definitionKey(s),
            identity: id,
            field,
            observedValue: card.row[field],
            schemaRevision: sourceRevision(p, id.sourceKind),
            destination,
        };
        this.options.onState?.("pending");
        return true;
    }
    chooseDestination(d: KanbanLaneValue) {
        if (!this.pending || !this.options.projection().lanes.some(l => Object.is(l.key, d))) {
            this.refuse("That lane is no longer available.");
            return false;
        }
        this.pending.destination = d;
        return true;
    }
    cancel() {
        this.sequence++;
        this.pending = undefined;
        this.options.onState?.("idle");
    }
    invalidateDefinition() {
        if (this.pending) this.refuse("The Kanban changed during this interaction.");
    }
    observeProjection(p: KanbanProjection) {
        if (!this.pending || p.status !== "success" || !p.current) return;
        const r = this.validateProjection(this.pending, p);
        if (r) this.refuse(r);
    }
    async commit(value: TableRecordValue): Promise<KanbanCardOperationResult> {
        const op = this.pending;
        if (!op) return this.result(false, "refused", "The card interaction is no longer active.");
        let refusal = this.validate(op, value);
        if (refusal) return this.finish(op, false, "refused", refusal);
        if (Object.is(op.observedValue, value)) return this.finish(op, false, "refused", "The value is unchanged.");
        try {
            const initial = this.options.projection();
            const route = columnRoute(initial, op.identity.sourceKind, op.field)!;
            await applyUnionedRowEdit(
                this.options.resolver,
                op.identity.sourceKind,
                op.identity.sourceId,
                route,
                value,
                () => {
                    refusal = this.validate(op, value);
                    if (refusal) throw new Error(refusal);
                    const currentRoute = columnRoute(this.options.projection(), op.identity.sourceKind, op.field);
                    if (currentRoute !== route) {
                        throw new Error("The result column route changed during this interaction.");
                    }
                    this.options.beginHistoryAction?.();
                },
            );
            if (this.pending !== op || op.token !== this.sequence) {
                return this.result(false, "refused", "The card interaction was invalidated.");
            }
            return this.finish(op, true, "success");
        } catch (e) {
            if (this.pending !== op) return this.result(false, "refused", "The card interaction was invalidated.");
            return this.finish(op, false, "error", e instanceof Error ? e.message : String(e));
        }
    }
    private validate(op: PendingOperation, value: TableRecordValue) {
        if (this.pending !== op || op.token !== this.sequence) return "The card interaction was invalidated.";
        if (!this.options.canWrite()) return "Project write access is unavailable.";
        const s = this.options.settings(), p = this.options.projection();
        if (!s || definitionKey(s) !== op.definition) return "The Kanban changed during this interaction.";
        if (p.status !== "success" || !p.current || !p.provenance) {
            return "Current query evidence is unavailable.";
        }
        const reason = this.validateProjection(op, p);
        if (reason) return reason;
        const route = columnRoute(p, op.identity.sourceKind, op.field);
        if (!route) return `Column "${op.field}" is read-only.`;
        if (sourceRevision(p, op.identity.sourceKind) !== op.schemaRevision) {
            return "The source schema changed during this interaction.";
        }
        const schema = this.options.schema?.(), column = schema?.columns.find(c => c.name === route);
        if (column) {
            const v = {
                valueKindOf: () => cellComponentTypeFor(undefined, column),
                checkOptionsOf: () => column.enumLabels ?? column.checkOptions,
                isNullableOf: () => column.isNullable,
            };
            if (!isValueValidForCell(v, route, value)) return "The value is invalid for this field.";
        }
        return undefined;
    }
    private validateProjection(op: PendingOperation, p: KanbanProjection) {
        if (op.destination !== undefined && !p.lanes.some(l => Object.is(l.key, op.destination))) {
            return "That lane is no longer available.";
        }
        const card = findCard(p, op.identity);
        if (!card) return "The source record is no longer in the current result.";
        if (!Object.is(card.row[op.field], op.observedValue)) return "The field changed during this interaction.";
        return undefined;
    }
    private refuse(message: string) {
        this.pending = undefined;
        this.options.onState?.("refused", message);
    }
    private finish(op: PendingOperation, ok: boolean, state: "success" | "refused" | "error", message?: string) {
        if (this.pending === op) this.pending = undefined;
        this.options.onState?.(state, message);
        return this.result(ok, state, message);
    }
    private result(ok: boolean, state: "success" | "refused" | "error", message?: string) {
        return { ok, state, message };
    }
}
function columnRoute(p: KanbanProjection, kind: string, output: string) {
    if (!p.provenance) return undefined;
    if (!p.provenance.analysis) {
        return p.provenance.sourceSqlName && p.provenance.sourceSqlName === kind
            ? output
            : undefined;
    }
    if (p.provenance.analysis.status !== "proven") return undefined;
    return unambiguousPhysicalColumn(p.provenance.analysis, kind, output);
}
function sourceRevision(p: KanbanProjection, kind: string) {
    return p.provenance?.analysis?.branches.find(branch => branch.source.sqlName === kind)?.source.schemaRevision;
}
function identityOf(c: KanbanCard, p: KanbanProjection): CardIdentity | undefined {
    if (!c.sourceIdentity?.id) return undefined;
    const sourceKind = c.sourceIdentity.kind ?? p.provenance?.sourceSqlName;
    return sourceKind ? { sourceKind, sourceId: c.sourceIdentity.id } : undefined;
}
function findCard(p: KanbanProjection, id: CardIdentity) {
    for (const l of p.lanes) {
        for (const c of l.cards) {
            if (
                c.sourceIdentity?.id === id.sourceId
                && (c.sourceIdentity.kind === id.sourceKind || c.sourceIdentity.kind === undefined)
            ) return c;
        }
    }
    return undefined;
}
function definitionKey(s: KanbanSettings) {
    return JSON.stringify([s.query, s.groupField, s.titleField, s.detailFields]);
}
