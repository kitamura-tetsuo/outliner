import {
    type Readable,
    writable,
} from "svelte/store";
import type { ColumnMeta } from "./sqlService";
import { SqlService } from "./sqlService";

export interface QueryResult {
    rows: any[];
    columnsMeta: ColumnMeta[];
}

export function createQueryStore(sql: SqlService, initialQuery = "") {
    const { subscribe, set } = writable<QueryResult>({ rows: [], columnsMeta: [] });

    async function run(query = initialQuery) {
        if (!query || query.trim() === '') {
            set({ rows: [], columnsMeta: [] });
            return;
        }

        try {
            const result = await sql.query(query);
            set(result);
        } catch (error) {
            // エラーが発生した場合は空の結果を設定
            set({ rows: [], columnsMeta: [] });
            throw error; // エラーは再スローして呼び出し元で処理
        }
    }

    return {
        subscribe,
        run,
    } as Readable<QueryResult> & { run: (q?: string) => Promise<void>; };
}
