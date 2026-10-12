import { cellComponentTypeFor } from "../../components/yjstable/cellComponents";
import { isValueValidForCell } from "./gridSelectionCommands";
import type { KanbanLaneValue, KanbanSettings } from "./kanbanDocs";
import type { KanbanCard, KanbanProjection } from "./kanbanQueryRunner";
import { analyzeQueryEditability, resolveBareIdMutationAuthority } from "./queryAnalysis";
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
    sourceKind?: string;
    sourceId: string;
}
interface PendingOperation {
    token: number;
    definition: string;
    identity: CardIdentity;
    field: string;
    observedValue: unknown;
    destination?: KanbanLaneValue;
}

export interface KanbanCardOperationOptions {
    resolver: RelationResolver;
    schema: () => ParsedTableSchema | undefined;
    settings: () => KanbanSettings | undefined;
    projection: () => KanbanProjection;
    canWrite: () => boolean;
    onState?: (state: KanbanCardOperationState, message?: string) => void;
}

/**
 * Local causal controller for a single mounted Kanban. It deliberately keeps
 * intent outside Yjs: only the final, revalidated single-cell write reaches a
 * relation provider. Query execution remains the authority for card position.
 */
export class KanbanCardOperationController {
    private sequence = 0;
    private pending: PendingOperation | undefined;

    constructor(private readonly options: KanbanCardOperationOptions) {}

    begin(card: KanbanCard, field: string, destination?: KanbanLaneValue): boolean {
        const settings = this.options.settings();
        const projection = this.options.projection();
        const identity = identityOf(card);
        if (
            !settings || !identity || !projection.current || projection.status !== "success" || !this.options.canWrite()
        ) {
            this.refuse("This card is not currently writable.");
            return false;
        }
        if (destination !== undefined && !projection.lanes.some(lane => Object.is(lane.key, destination))) {
            this.refuse("That lane is no longer available.");
            return false;
        }
        this.pending = {
            token: ++this.sequence,
            definition: definitionKey(settings),
            identity,
            field,
            observedValue: card.row[field],
            destination,
        };
        this.options.onState?.("pending");
        return true;
    }

    chooseDestination(destination: KanbanLaneValue): boolean {
        if (!this.pending || !this.options.projection().lanes.some(lane => Object.is(lane.key, destination))) {
            this.refuse("That lane is no longer available.");
            return false;
        }
        this.pending.destination = destination;
        return true;
    }

    cancel(): void {
        this.sequence++;
        this.pending = undefined;
        this.options.onState?.("idle");
    }

    /** Definition mutations are observed independently, so A→B→A cannot revive a gesture. */
    invalidateDefinition(): void {
        if (this.pending) this.refuse("The Kanban changed during this interaction.");
    }

    async commit(value: TableRecordValue): Promise<KanbanCardOperationResult> {
        const operation = this.pending;
        if (!operation) return this.result(false, "refused", "The card interaction is no longer active.");
        const refusal = this.validate(operation, value);
        if (refusal) return this.finish(operation, false, "refused", refusal);
        if (Object.is(operation.observedValue, value)) {
            return this.finish(operation, false, "refused", "The value is unchanged.");
        }

        try {
            await applyUnionedRowEdit(
                this.options.resolver,
                operation.identity.sourceKind ?? this.options.projection().provenance!.sourceSqlName,
                operation.identity.sourceId,
                operation.field,
                value,
                () => {
                    const reason = this.validate(operation, value);
                    if (reason) throw new Error(reason);
                },
            );
            if (this.pending !== operation || operation.token !== this.sequence) {
                return this.result(false, "refused", "The card interaction was invalidated.");
            }
            return this.finish(operation, true, "success");
        } catch (error) {
            if (this.pending !== operation) {
                return this.result(false, "refused", "The card interaction was invalidated.");
            }
            return this.finish(operation, false, "error", error instanceof Error ? error.message : String(error));
        }
    }

    private validate(operation: PendingOperation, value: TableRecordValue): string | undefined {
        if (this.pending !== operation || operation.token !== this.sequence) {
            return "The card interaction was invalidated.";
        }
        if (!this.options.canWrite()) return "Project write access is unavailable.";
        const settings = this.options.settings();
        const projection = this.options.projection();
        const schema = this.options.schema();
        if (!settings || definitionKey(settings) !== operation.definition) {
            return "The Kanban changed during this interaction.";
        }
        if (projection.status !== "success" || !projection.current || !projection.provenance || !schema) {
            return "Current query evidence is unavailable.";
        }
        if (
            operation.destination !== undefined
            && !projection.lanes.some(lane => Object.is(lane.key, operation.destination))
        ) {
            return "That lane is no longer available.";
        }
        const card = findCard(projection, operation.identity);
        if (!card) return "The source record is no longer in the current result.";
        if (!Object.is(card.row[operation.field], operation.observedValue)) {
            return "The field changed during this interaction.";
        }

        const authority = resolveBareIdMutationAuthority(
            projection.provenance.query,
            projection.provenance.sourceSqlName,
            schema,
            projection.result?.columns ?? projection.columns,
        );
        const editability = analyzeQueryEditability(
            projection.provenance.query,
            schema,
            projection.result?.columns ?? projection.columns,
            operation.identity.sourceKind ? undefined : authority,
        );
        if (!editability.editable || !editability.editableColumns.has(operation.field)) {
            return editability.readOnlyReason ?? `Column "${operation.field}" is read-only.`;
        }
        if ((editability.rowIdentity === "source") !== Boolean(operation.identity.sourceKind)) {
            return "The result identity route changed during this interaction.";
        }
        const column = schema.columns.find(candidate => candidate.name === operation.field);
        if (!column) return `Column "${operation.field}" is not in the applied schema.`;
        const validation = {
            valueKindOf: () => cellComponentTypeFor(undefined, column),
            checkOptionsOf: () => column.enumLabels ?? column.checkOptions,
            isNullableOf: () => column.isNullable,
        };
        if (!isValueValidForCell(validation, operation.field, value)) return "The value is invalid for this field.";
        return undefined;
    }

    private refuse(message: string): void {
        this.pending = undefined;
        this.options.onState?.("refused", message);
    }
    private finish(operation: PendingOperation, ok: boolean, state: "success" | "refused" | "error", message?: string) {
        if (this.pending === operation) this.pending = undefined;
        this.options.onState?.(state, message);
        return this.result(ok, state, message);
    }
    private result(ok: boolean, state: "success" | "refused" | "error", message?: string): KanbanCardOperationResult {
        return { ok, state, message };
    }
}

function identityOf(card: KanbanCard): CardIdentity | undefined {
    if (!card.sourceIdentity?.id) return undefined;
    return { sourceKind: card.sourceIdentity.kind, sourceId: card.sourceIdentity.id };
}
function sameIdentity(card: KanbanCard, identity: CardIdentity): boolean {
    return card.sourceIdentity?.id === identity.sourceId && card.sourceIdentity.kind === identity.sourceKind;
}
function findCard(projection: KanbanProjection, identity: CardIdentity): KanbanCard | undefined {
    for (const lane of projection.lanes) for (const card of lane.cards) if (sameIdentity(card, identity)) return card;
    return undefined;
}
function definitionKey(settings: KanbanSettings): string {
    return JSON.stringify([
        settings.sourceTableId,
        settings.query,
        settings.groupField,
        settings.titleField,
        settings.detailFields,
    ]);
}
