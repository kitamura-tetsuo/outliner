import { describe, it, expect } from 'vitest';
import { SqlService } from '../services/sqlService';

describe('SqlService', () => {
    it('executes query and returns metadata', async () => {
        const svc = new SqlService();
        await svc.exec('CREATE TABLE t(id TEXT PRIMARY KEY, value TEXT)');
        await svc.exec("INSERT INTO t(id,value) VALUES('1','a')");
        const result = await svc.query('SELECT id, value FROM t');
        expect(result.rows.length).toBe(1);
        expect(result.columnsMeta.length).toBe(2);
    });
});
