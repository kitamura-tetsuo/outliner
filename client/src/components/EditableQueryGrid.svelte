<script lang="ts">
import { Grid } from "wx-svelte-grid";
import { mapEdit } from "../services/editMapper";
import type { ColumnMeta } from "../services/sqlService";

type Props = {
    rows?: any[];
    columns?: ColumnMeta[];
    onedit?: (info: any) => void;
};
let { rows = [], columns = [], onedit }: Props = $props();

function onEdit(e: any) {
    const { rowIndex, columnIndex, value } = e.detail;
    const row = rows[rowIndex];
    const info = mapEdit(columns, row, columnIndex, value);
    if (info && onedit) onedit(info);
}
</script>

<Grid
    {rows}
    columns={columns.map(c => ({ field: c.column || "", headerName: c.column || "", editable: !!(c.table && c.column) }))}
    on:cellEditCommit={onEdit}
/>
