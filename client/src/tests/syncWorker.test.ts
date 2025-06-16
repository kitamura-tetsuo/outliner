import { describe, it, expect } from 'vitest';
import { SqlService } from '../services/sqlService';
import { startSync } from '../services/syncWorker';

class FakeTables extends Map<string, Map<string, Map<string, any>>> {
    private listeners: (() => void)[] = [];
    on(event: string, fn: () => void) { if (event === 'valueChanged') this.listeners.push(fn); }
    emit(event: string) { if (event === 'valueChanged') this.listeners.forEach(f => f()); }
}

class FakeClient {
    tables = new FakeTables();
    updateCell({ tableId, rowId, column, value }: { tableId: string; rowId: string; column: string; value: any }) {
        let table = this.tables.get(tableId);
        if (!table) { table = new Map(); this.tables.set(tableId, table); }
        let row = table.get(rowId);
        if (!row) { row = new Map(); table.set(rowId, row); }
        row.set(column, value);
        this.tables.emit('valueChanged');
    }
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

describe('syncWorker', () => {
    it('writes Fluid updates to SQLite and triggers callback', async () => {
        const client = new FakeClient();
        const sql = new SqlService();
        await sql.exec('CREATE TABLE tbl(id TEXT PRIMARY KEY, value TEXT)');
        let called = false;
        startSync(client as any, sql, () => { called = true; });
        client.updateCell({ tableId: 'tbl', rowId: '1', column: 'value', value: 'a' });
        await delay(10);
        const result = await sql.query("SELECT value FROM tbl WHERE id='1'");
        expect(result.rows[0].value).toBe('a');
        expect(called).toBe(true);
    });
});
