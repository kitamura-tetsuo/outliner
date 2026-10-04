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
const revision = z.string();
const outlineNode: z.ZodType = z.lazy(() =>
    z.looseObject({
        id: z.string(),
        kind: z.enum(["text", "grid", "calendar"]),
        childCount: z.number().int().nonnegative(),
        revision,
        parentId: z.string().optional(),
        text: z.string().optional(),
        gridId: z.string().optional(),
        calendarId: z.string().optional(),
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
        kind: z.enum(["project", "page", "grid", "calendar", "table", "schedule", "schedule-list"]),
        pageId: z.string().optional(),
        entityId: z.string().optional(),
    }),
    get_item: outlineNode,
    get_subtree: z.looseObject({ root: outlineNode, truncated: z.boolean() }),
    get_ancestors: z.array(outlineNode),
    search_items: z.array(outlineNode),
    get_grid: z.looseObject({
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
        columns: z.array(z.object({ name: z.string(), type: z.string() })),
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
        sourceTableId: z.string(),
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
