declare module "sql.js" {
    export interface Database {
        exec(sql: string): QueryExecResult[];
        prepare(sql: string): Statement;
        close(): void;
    }

    export interface Statement {
        bind(values?: BindParams): boolean;
        run(values?: BindParams): void;
        step(): boolean;
        getAsObject(): Record<string, unknown>;
        free(): boolean;
    }

    export type BindParams = (string | number | null | Uint8Array)[] | Record<string, string | number | null>;

    export interface QueryExecResult {
        columns: string[];
        values: unknown[][];
    }

    export interface SqlJsStatic {
        Database: new(data?: Uint8Array) => Database;
    }

    export default function initSqlJs(config?: unknown): Promise<SqlJsStatic>;
}
