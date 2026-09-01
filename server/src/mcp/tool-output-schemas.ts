import * as z from "zod/v4";

const jsonObject = z.looseObject({});
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
        components: jsonObject,
        revision,
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
        resultColumns: z.array(jsonObject),
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
        columns: z.array(z.string()),
        rows: z.array(jsonObject),
        truncated: z.boolean(),
    }),
    write_relation: relationMutation,
    update_grid_query: mutation,
    set_view_query: mutation,
    update_table_schema: mutation,
    update_table_records: mutation.extend({ records: z.array(jsonObject) }),
} as const;

export type OutlinerToolName = keyof typeof toolOutputSchemas;
