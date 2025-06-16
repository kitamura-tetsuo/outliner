import { writable, type Readable } from 'svelte/store';
import type { ColumnMeta } from './sqlService';
import { SqlService } from './sqlService';

export interface QueryResult {
    rows: any[];
    columnsMeta: ColumnMeta[];
}

export function createQueryStore(sql: SqlService, initialQuery = '') {
    const { subscribe, set } = writable<QueryResult>({ rows: [], columnsMeta: [] });

    async function run(query = initialQuery) {
        if (!query) return;
        const result = await sql.query(query);
        set(result);
    }

    run();

    return {
        subscribe,
        run,
    } as Readable<QueryResult> & { run: (q?: string) => Promise<void> };
}
