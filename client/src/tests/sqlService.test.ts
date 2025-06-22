import { describe, it, expect, beforeAll } from 'vitest';
import { initDb, execute } from '../services/sqlService';

beforeAll(async () => {
    await initDb();
    execute('CREATE TABLE test(id integer primary key, value text);');
    execute("INSERT INTO test(value) VALUES ('a'), ('b');");
});

describe('sqlService', () => {
    it('executes select query', () => {
        const result = execute('SELECT id, value FROM test ORDER BY id');
        expect(result.rows).toEqual([
            { id: 1, value: 'a' },
            { id: 2, value: 'b' },
        ]);
        expect(result.columnsMeta.length).toBe(2);
    });
});
