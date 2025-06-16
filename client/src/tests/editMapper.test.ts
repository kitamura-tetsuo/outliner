import { describe, it, expect } from 'vitest';
import { mapEdit } from '../services/editMapper';
import type { ColumnMeta } from '../services/sqlService';

describe('editMapper', () => {
    it('maps edit to table info', () => {
        const cols: ColumnMeta[] = [
            { table: 't', column: 'value', db: null }
        ];
        const row = { t_pk: '1', value: 'a' };
        const info = mapEdit(cols, row, 0, 'b');
        expect(info).toEqual({ tableId: 't', pk: '1', column: 'value', value: 'b' });
    });
});
