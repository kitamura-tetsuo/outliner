<script lang="ts">
import { Grid } from 'wx-svelte-grid';
import type { ColumnMeta } from '../services/sqlService';
import { mapEdit } from '../services/editMapper';
import { createEventDispatcher } from 'svelte';

export let rows: any[] = [];
export let columns: ColumnMeta[] = [];

const dispatch = createEventDispatcher();

function onEdit(e: any) {
    const { rowIndex, columnIndex, value } = e.detail;
    const row = rows[rowIndex];
    const info = mapEdit(columns, row, columnIndex, value);
    if (info) dispatch('edit', info);
}
</script>

<Grid {rows}
    columns={columns.map(c => ({ field: c.column || '', headerName: c.column || '', editable: !!(c.table && c.column) }))}
    on:cellEditCommit={onEdit} />
