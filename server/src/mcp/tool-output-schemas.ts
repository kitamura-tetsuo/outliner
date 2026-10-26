import * as z from "zod/v4";

const jsonObject = z.looseObject({});
const gridColumn = z.looseObject({ name: z.string(), shown: z.boolean() });
const gridComponent = z.looseObject({ shown: z.boolean() });
const gridPresentationComponent = z.strictObject({
    label: z.string().nullable(),
    type: z.string().nullable(),
    shown: z.boolean(),
    // Saved border-box width in CSS px, or null for automatic sizing (issue
    // #5456): the presentation snapshot always carries this key.
    widthPx: z.number().nullable(),
});
const gridPresentation = z.strictObject({
    name: z.string(),
    columnOrder: z.array(z.string()),
    components: z.record(z.string(), gridPresentationComponent),
    showAddRowButton: z.boolean(),
    confirmRowDelete: z.boolean(),
});
const sourceRelation = z.object({
    kind: z.enum(["table", "system"]),
    id: z.string(),
    sqlName: z.string(),
});
const sourceDiagnostics = z.object({
    execution: z.object({
        status: z.enum(["completed", "loading", "error", "unavailable"]),
        current: z.boolean(),
        queryId: z.string().optional(),
        executionGeneration: z.number().optional(),
        catalogRevision: z.string().optional(),
    }),
    dependencies: z.object({
        status: z.enum(["proven", "unknown"]),
        relations: z.array(sourceRelation),
        count: z.number().optional(),
        truncated: z.boolean(),
    }),
    provenance: z.object({
        supplierCount: z.number().optional(),
        branchCount: z.number().optional(),
        truncated: z.boolean(),
        status: z.enum(["proven", "unsupported", "unknown"]),
        reason: z.string().max(512).optional(),
        suppliers: z.array(sourceRelation),
        branches: z.array(
            z.object({
                source: sourceRelation,
                columns: z.array(
                    z.object({ outputColumn: z.string(), physicalColumn: z.string(), source: sourceRelation }),
                ),
                routedIdentity: z.boolean(),
                claimedSourceKind: z.string().max(512).optional(),
            }),
        ),
        bareIdSource: sourceRelation.optional(),
    }),
    insert: z.object({
        mode: z.enum([
            "automatic",
            "configured",
            "selection-required",
            "invalid-selection",
            "unsupported",
            "unavailable",
        ]),
        target: z.object({
            kind: z.enum(["table", "system"]),
            id: z.string(),
            sqlName: z.string(),
            requiresDestination: z.boolean(),
        }).optional(),
        preferenceDiagnostic: z.object({
            code: z.enum(["not-a-supplier", "unavailable"]),
            tableId: z.string(),
            message: z.string().max(512),
        }).optional(),
        reason: z.string().max(512).optional(),
    }),
});
const revision = z.string();
const outlineNode: z.ZodType = z.lazy(() =>
    z.looseObject({
        id: z.string(),
        kind: z.enum(["text", "grid", "calendar", "layout", "diagram", "kanban"]),
        childCount: z.number().int().nonnegative(),
        revision,
        parentId: z.string().optional(),
        text: z.string().optional(),
        gridId: z.string().optional(),
        calendarId: z.string().optional(),
        diagramId: z.string().optional(),
        kanbanId: z.string().optional(),
        placementId: z.string().optional(),
        children: z.array(outlineNode).optional(),
    })
);
const diagnostic = z.looseObject({ message: z.string() });
const validation = z.looseObject({
    accepted: z.boolean(),
    errors: z.array(diagnostic),
});
const mutation = z.looseObject({
    applied: z.boolean(),
    priorRevision: revision,
    revision,
    replayed: z.boolean(),
});
const relationMutation = z.looseObject({
    relation: z.string(),
    op: z.enum(["UPDATE", "INSERT", "DELETE"]),
    rowId: z.string().optional(),
    applied: z.boolean(),
    // INSERT creates a new entity, so there is no prior entity revision.
    priorRevision: revision.optional(),
    revision,
    replayed: z.boolean(),
});

/**
 * Successful result contracts for every tool exposed through the common MCP
 * registration path. Object contracts are deliberately loose only for fields
 * whose domain payload is extensible; their stable discriminators and core
 * fields remain required. Array results stay arrays (MCP 2026-07-28).
 */
export const toolOutputSchemas = {
    resolve_url: z.looseObject({
        projectId: z.string(),
        kind: z.enum([
            "project",
            "page",
            "grid",
            "calendar",
            "table",
            "schedule",
            "schedule-list",
            "kanban",
            "kanban-list",
        ]),
        pageId: z.string().optional(),
        entityId: z.string().optional(),
    }),
    get_item: outlineNode,
    get_subtree: z.looseObject({ root: outlineNode, truncated: z.boolean() }),
    get_ancestors: z.array(outlineNode),
    search_items: z.array(outlineNode),
    list_kanbans: z.looseObject({
        projectId: z.string(),
        kanbans: z.array(z.object({ kanbanId: z.string(), name: z.string() })),
        totalCount: z.number().int().nonnegative(),
        returnedCount: z.number().int().nonnegative(),
        truncated: z.boolean(),
        nextCursor: z.string().optional(),
    }),
    get_kanban: z.looseObject({
        projectId: z.string(),
        kanbanId: z.string(),
        settings: jsonObject,
        projection: z.object({ evaluated: z.literal(false) }),
        placements: z.array(jsonObject),
        placementCount: z.number().int().nonnegative(),
        returnedCount: z.number().int().nonnegative(),
        offset: z.number().int().nonnegative(),
        truncated: z.boolean(),
        mutationObservation: jsonObject,
        observationToken: z.string().optional(),
        expiresAt: z.string().optional(),
    }),
    query_kanban: z.looseObject({
        projectId: z.string(),
        kanbanId: z.string(),
        projection: jsonObject,
        lanes: z.array(jsonObject).optional(),
        counts: jsonObject.optional(),
        mutationObservation: jsonObject,
        observationToken: z.string().optional(),
        expiresAt: z.string().optional(),
    }),
    get_grid: z.looseObject({
        insertTargetTableId: z.string().optional(),
        sourceDiagnostics: sourceDiagnostics,
        id: z.string(),
        name: z.string(),
        query: z.string(),
        columnOrder: z.array(z.json()),
        columns: z.array(gridColumn),
        components: z.record(z.string(), gridComponent),
        revision,
        presentation: gridPresentation,
        presentationRevision: z.string(),
    }),
    get_calendar: z.looseObject({
        id: z.string(),
        name: z.string(),
        query: z.string(),
        viewType: z.string(),
        groupAxes: z.array(z.json()),
        laneOrder: z.array(z.json()),
        revision,
    }),
    list_schedules: z.looseObject({
        schedules: z.array(z.looseObject({ ruleId: z.string(), revision })),
        page: z.looseObject({ limit: z.number().int(), truncated: z.boolean() }),
    }),
    get_schedule: z.looseObject({ ruleId: z.string(), revision, stored: jsonObject }),
    validate_schedule_rule: validation.extend({ candidateRows: z.array(jsonObject) }),
    update_schedule_rule: mutation,
    update_table_schedule_sql: mutation,
    get_table: z.looseObject({
        tableId: z.string(),
        displayName: z.string(),
        sqlName: z.string(),
        rawSchemaSql: z.string(),
        schema: jsonObject,
        recordCount: z.number().int().nonnegative(),
        revision,
        scheduleReferences: z.array(jsonObject),
    }),
    trace_grid: z.looseObject({
        sourceDiagnostics,
        insertTargetTableId: z.string().optional(),
        version: z.literal(1),
        gridId: z.string(),
        revision,
        stages: z.array(z.looseObject({ stage: z.string(), observed: z.boolean() })),
    }),
    validate_table_schema: validation.extend({
        migrationDiff: jsonObject,
        affectedRecords: jsonObject,
        warnings: z.array(z.string()),
    }),
    validate_grid_query: validation.extend({
        sourceDiagnostics,
        dependencies: z.array(z.string()),
        resultColumns: z.array(gridColumn),
        sampleRows: z.array(jsonObject),
        editability: jsonObject,
    }),
    list_relations: z.looseObject({ relations: z.array(z.looseObject({ relation: z.string(), kind: z.string() })) }),
    get_relation_schema: z.looseObject({
        relation: z.string(),
        columns: z.array(jsonObject),
        capabilities: jsonObject,
    }),
    query_sql: z.looseObject({
        // Catalog-backed result types carry additive ENUM provenance.
        columns: z.array(z.looseObject({ name: z.string(), type: z.string() })),
        rows: z.array(jsonObject),
        rowCount: z.number().int().nonnegative(),
        truncated: z.boolean(),
    }),
    write_relation: relationMutation,
    create_grid: z.object({
        applied: z.boolean(),
        replayed: z.boolean(),
        gridId: z.string().min(1).optional(),
        placementId: z.string().min(1).optional(),
        insertTargetTableId: z.string().optional(),
        sourceDiagnostics: sourceDiagnostics,
        pageId: z.string(),
        name: z.string(),
        query: z.string().min(1),
        revision,
    }).refine(result =>
        result.applied
            ? !!result.gridId && !!result.placementId
            : result.gridId === undefined && result.placementId === undefined && !result.replayed
    ),
    // A dry run has no Table yet: no ID and no persisted revision. A confirmed
    // apply (or its replay) always has both, describing the original creation.
    create_table: z.strictObject({
        applied: z.boolean(),
        replayed: z.boolean(),
        tableId: z.string().min(1).optional(),
        displayName: z.string(),
        sqlName: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
        schemaSql: z.string().min(1),
        revision: revision.optional(),
    }).refine(result =>
        result.applied
            ? result.tableId !== undefined && result.revision !== undefined
            : result.tableId === undefined && result.revision === undefined && !result.replayed
    ),
    update_grid_query: mutation,
    // A dry run carries a detached candidate plus wouldChange and has no
    // persisted revision beyond the unchanged current one. A normal apply
    // carries no candidate fields. Unknown effects are errors, never success.
    update_grid_presentation: z.strictObject({
        projectId: z.string(),
        gridId: z.string(),
        dryRun: z.boolean(),
        applied: z.boolean(),
        replayed: z.boolean(),
        priorPresentationRevision: z.string(),
        presentationRevision: z.string(),
        presentation: gridPresentation,
        candidatePresentation: gridPresentation.optional(),
        wouldChange: z.boolean().optional(),
    }).refine(result =>
        result.dryRun
            ? result.applied === false && result.replayed === false
                && result.candidatePresentation !== undefined && result.wouldChange !== undefined
            : result.candidatePresentation === undefined && result.wouldChange === undefined
    ),
    set_view_query: mutation,
    update_table_schema: mutation,
    update_table_records: mutation.extend({ records: z.array(jsonObject) }),
} as const;

export type OutlinerToolName = keyof typeof toolOutputSchemas;
