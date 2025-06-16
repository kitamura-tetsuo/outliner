<script lang="ts">
export const ssr = false;
import { onMount } from "svelte";
import { setupGlobalDebugFunctions } from "../../lib/debug";
import ChartPanel from "../../components/ChartPanel.svelte";
import EditableQueryGrid from "../../components/EditableQueryGrid.svelte";
import QueryEditor from "../../components/QueryEditor.svelte";
import { FluidTableClient } from "../../services/fluidClient";
import { createQueryStore } from "../../services/queryStore";
import { SqlService } from "../../services/sqlService";
import { startSync } from "../../services/syncWorker";

if (typeof window !== 'undefined') {
    (window as any).__FLUID_STORE__ = (window as any).__FLUID_STORE__ || {};
    (window as any).__SVELTE_GOTO__ = (window as any).__SVELTE_GOTO__ || (() => {});
    (window as any).__JOIN_TABLE__ = (window as any).__JOIN_TABLE__ || {};
}

const sql = new SqlService();
const fluid = new FluidTableClient();
let query = "SELECT id as tbl_pk, value, num FROM tbl";
const store = createQueryStore(sql, query);
let rows: any[] = [];
let columns = [];
let chartOption: any = {};

function refreshChart() {
    chartOption = {
        xAxis: { type: "category", data: rows.map(r => r.value) },
        yAxis: { type: "value" },
        series: [{ type: "bar", data: rows.map(r => r.num) }],
    };
    if (typeof window !== 'undefined') {
        (window as any).__JOIN_TABLE__.chartOption = chartOption;
    }
}

store.subscribe(r => {
    rows = r.rows;
    columns = r.columnsMeta;
    refreshChart();
});

function onEdit(e: CustomEvent<any>) {
    fluid.updateCell({
        tableId: e.detail.tableId,
        rowId: e.detail.pk,
        column: e.detail.column,
        value: e.detail.value,
    });
}

onMount(async () => {
    setupGlobalDebugFunctions({});
    if (typeof window !== 'undefined') {
        (window as any).__JOIN_TABLE__.fluid = fluid;
        (window as any).__JOIN_TABLE__.store = store;
        (window as any).__JOIN_TABLE__.sql = sql;
    }
    await fluid.createContainer();
    await sql.exec("CREATE TABLE tbl(id TEXT PRIMARY KEY, value TEXT, num INTEGER)");
    await sql.exec("INSERT INTO tbl VALUES('1','a',1),('2','b',2)");
    startSync(fluid, sql, () => store.run());
    await store.run();
});
</script>

<QueryEditor bind:query on:run={e => store.run(e.detail.query)} />
<EditableQueryGrid {rows} {columns} on:edit={onEdit} />
<ChartPanel option={chartOption} />
