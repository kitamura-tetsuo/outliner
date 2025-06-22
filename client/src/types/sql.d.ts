declare module 'sql.js' {
    export interface Database {
        exec(sql: string): QueryExecResult[];
        close(): void;
    }

    export interface QueryExecResult {
        columns: string[];
        values: any[][];
    }

    export interface SqlJsStatic {
        Database: new (data?: Uint8Array) => Database;
    }

    export default function initSqlJs(config?: any): Promise<SqlJsStatic>;
}
