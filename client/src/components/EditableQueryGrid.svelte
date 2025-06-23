<script lang="ts">
import DataGrid from 'wx-svelte-grid';
import { queryStore, applyEdit } from '../services/sqlService';
import { mapEdit } from '../services/editMapper';
import { get } from 'svelte/store';

let data = { rows: [], columnsMeta: [] } as any;
queryStore.subscribe(v => data = v);

function onCellEdited(event: CustomEvent) {
    const { rowIndex, columnKey, newValue } = (event as any).detail;
    const row = data.rows[rowIndex];
    const info = mapEdit(data.columnsMeta, row, columnKey);
    if (info) {
        row[columnKey] = newValue;
        queryStore.update(q => {
            q.rows[rowIndex][columnKey] = newValue;
            return q;
        });
        applyEdit(info, newValue);
    }
}
</script>

<div class="editable-query-grid">
    <DataGrid {data.rows} columns={data.columnsMeta.map(c => ({ key: c.name, name: c.name }))}
        on:cellEdited={onCellEdited} />
</div>
