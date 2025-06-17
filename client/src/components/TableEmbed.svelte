<script lang="ts">
import { onMount } from "svelte";
import QueryEditor from "./QueryEditor.svelte";
import EditableQueryGrid from "./EditableQueryGrid.svelte";
import ChartPanel from "./ChartPanel.svelte";
import { SqlService } from "../services/sqlService";
import { FluidTableClient } from "../services/fluidClient";
import { createQueryStore } from "../services/queryStore";
import { startSync } from "../services/syncWorker";

export let query: string = "SELECT id as tbl_pk, value, num FROM tbl";

let sql: SqlService;
let fluid: FluidTableClient;
let store: ReturnType<typeof createQueryStore>;
let rows: any[] = $state([]);
let columns: any[] = $state([]);
let chartOption: any = $state({});

function refreshChart() {
    chartOption = {
        xAxis: { type: "category", data: rows.map(r => r.value) },
        yAxis: { type: "value" },
        series: [{ type: "bar", data: rows.map(r => r.num) }],
    };
}

function onEdit(e: CustomEvent<any>) {
    fluid.updateCell({
        tableId: e.detail.tableId,
        rowId: e.detail.pk,
        column: e.detail.column,
        value: e.detail.value,
    });
}

onMount(async () => {
    sql = new SqlService();
    fluid = new FluidTableClient();
    store = createQueryStore(sql, query);
    store.subscribe(r => {
        rows = r.rows;
        columns = r.columnsMeta;
        refreshChart();
    });
    startSync(fluid, sql, () => store.run());
    await fluid.createContainer();
    await sql.exec("CREATE TABLE tbl(id TEXT PRIMARY KEY, value TEXT, num INTEGER)");
    await sql.exec("INSERT INTO tbl VALUES('1','a',1),('2','b',2)");
    await store.run(query);
});
</script>

<div class="table-embed">
    <QueryEditor {query} onrun={e => store.run(e.query)} />
    <EditableQueryGrid {rows} {columns} onedit={onEdit} />
    <ChartPanel option={chartOption} />
</div>

<style>
.table-embed {
    margin-top: 8px;
}
</style>
