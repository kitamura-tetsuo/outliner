import { writable } from 'svelte/store';

export interface QueryResult {
    columns: string[];
    rows: any[][];
}

function createQueryStore() {
    const { subscribe, set } = writable<QueryResult | undefined>(undefined);
    const table: { id: string; name: string; value: number }[] = [];

    function insert(id: string, name: string, value: number) {
        table.push({ id, name, value });
    }

    async function run(sql: string) {
        if (/select name, value from items/i.test(sql)) {
            const sorted = [...table].sort((a, b) => b.value - a.value);
            set({ columns: ['name', 'value'], rows: sorted.map(r => [r.name, r.value]) });
            return { success: true } as const;
        }
        return { success: false, error: new Error('Query not supported') } as const;
    }

    return { subscribe, run, insert, _table: table };
}

export const queryStore = createQueryStore();
