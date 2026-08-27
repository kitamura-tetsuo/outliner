import { orderColumns } from "./columnOrder";
import type { TableQueryExecution } from "./tableQueryRunner";
import type { TableQueryResult } from "./tableSyncAdapter";

const MAX_SAMPLE_ROWS = 5;
const MAX_SAMPLE_COLUMNS = 20;
const MAX_VALUE_LENGTH = 200;
const MAX_TRACE_COLUMNS = 100;
const MAX_QUERY_LENGTH = 2_000;

export interface GridRenderTraceInput {
    gridId: string;
    sourceTableId: string;
    projectId?: string;
    projectDocumentId: string;
    tableDocumentId: string;
    configRevision: string;
    clientRevision: number;
    query: string;
    result: TableQueryResult;
    execution?: TableQueryExecution;
    columnOrder: readonly string[];
    hiddenColumns: Readonly<Record<string, boolean>>;
}

export interface GridRenderTrace {
    version: 1;
    gridId: string;
    sourceTableId: string;
    projectId?: string;
    generatedAt: string;
    stages: readonly GridRenderTraceStage[];
}

export type GridRenderTraceStage =
    | {
        stage: "config";
        revision: string;
        projectDocumentId: string;
        tableDocumentId: string;
        query: string;
        columnOrder: readonly string[];
        hiddenColumns: readonly string[];
    }
    | ({ stage: "query-execution"; } & TableQueryExecution)
    | {
        stage: "client-state";
        revision: number;
        queryId?: string;
        resultStale: boolean;
        rowCount: number;
        columnCount: number;
        columns: readonly string[];
    }
    | {
        stage: "render";
        revision: number;
        queryId?: string;
        resultStale: boolean;
        rowCount: number;
        columnCount: number;
        columns: readonly string[];
        appliedTransforms: readonly string[];
        sample: readonly Readonly<Record<string, unknown>>[];
        sampleTruncated: boolean;
    };

/** Build a bounded, serializable snapshot of the real Grid rendering pipeline. */
export function buildGridRenderTrace(input: GridRenderTraceInput): GridRenderTrace {
    const orderedColumns = orderColumns([...input.result.columns], [...input.columnOrder]);
    const renderedColumns = orderedColumns.filter(column => input.hiddenColumns[column] !== true);
    const sampledColumns = renderedColumns.slice(0, MAX_SAMPLE_COLUMNS);
    const configuredHiddenColumns = Object.entries(input.hiddenColumns)
        .filter(([, hidden]) => hidden === true)
        .map(([column]) => column)
        .sort();
    const renderedHiddenColumns = orderedColumns.filter(column => input.hiddenColumns[column] === true);
    const resultStale = input.execution !== undefined && input.execution.query !== input.query;
    const appliedTransforms: string[] = [];
    if (!arraysEqual(orderedColumns, input.result.columns)) appliedTransforms.push("column-order");
    if (renderedHiddenColumns.length > 0) {
        appliedTransforms.push(`hidden-columns:${renderedHiddenColumns.slice(0, MAX_TRACE_COLUMNS).join(",")}`);
    }

    return {
        version: 1,
        gridId: input.gridId,
        sourceTableId: input.sourceTableId,
        projectId: input.projectId,
        generatedAt: new Date().toISOString(),
        stages: [
            {
                stage: "config",
                revision: input.configRevision,
                projectDocumentId: input.projectDocumentId,
                tableDocumentId: input.tableDocumentId,
                query: truncate(input.query, MAX_QUERY_LENGTH),
                columnOrder: input.columnOrder.slice(0, MAX_TRACE_COLUMNS),
                hiddenColumns: configuredHiddenColumns.slice(0, MAX_TRACE_COLUMNS),
            },
            ...(input.execution ? [{ stage: "query-execution" as const, ...input.execution }] : []),
            {
                stage: "client-state",
                revision: input.clientRevision,
                queryId: input.execution?.queryId,
                resultStale,
                rowCount: input.result.rows.length,
                columnCount: input.result.columns.length,
                columns: input.result.columns.slice(0, MAX_TRACE_COLUMNS),
            },
            {
                stage: "render",
                revision: input.clientRevision,
                queryId: input.execution?.queryId,
                resultStale,
                rowCount: input.result.rows.length,
                columnCount: renderedColumns.length,
                columns: renderedColumns.slice(0, MAX_TRACE_COLUMNS),
                appliedTransforms,
                sample: input.result.rows.slice(0, MAX_SAMPLE_ROWS).map(row => sampleRow(row, sampledColumns)),
                sampleTruncated: input.result.rows.length > MAX_SAMPLE_ROWS
                    || renderedColumns.length > MAX_SAMPLE_COLUMNS,
            },
        ],
    };
}

function sampleRow(row: Readonly<Record<string, unknown>>, columns: readonly string[]): Record<string, unknown> {
    return Object.fromEntries(columns.map(column => [column, boundedValue(row[column])]));
}

function boundedValue(value: unknown): unknown {
    if (typeof value === "string" && value.length > MAX_VALUE_LENGTH) {
        return truncate(value, MAX_VALUE_LENGTH);
    }
    if (value === undefined || value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
    const serialized = JSON.stringify(value);
    return serialized.length <= MAX_VALUE_LENGTH ? value : `${serialized.slice(0, MAX_VALUE_LENGTH)}…`;
}

function truncate(value: string, length: number): string {
    return value.length > length ? `${value.slice(0, length)}…` : value;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}
