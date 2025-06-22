import { describe, it, expect, beforeAll } from 'vitest';
import { queryStore } from '../services/queryStore';

describe('queryStore', () => {
    beforeAll(() => {
        queryStore.insert('1', 'a', 10);
        queryStore.insert('2', 'b', 20);
    });

    it('runs SELECT query', async () => {
        const res = await queryStore.run('SELECT name, value FROM items ORDER BY value DESC');
        expect(res.success).toBe(true);
        let rows: any[][] = [];
        const unsubscribe = queryStore.subscribe(r => { if (r) rows = r.rows; });
        unsubscribe();
        expect(rows[0][0]).toBe('b');
    });

    it('handles errors', async () => {
        const res = await queryStore.run('SELECT * FROM unknown');
        expect(res.success).toBe(false);
    });
});
