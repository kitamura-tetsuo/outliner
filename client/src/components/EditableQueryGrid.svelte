<script lang="ts">
import DataGrid from 'wx-svelte-grid';
import { queryStore } from '../services/sqlService';
import { $state } from 'svelte';
const data = $state(queryStore);
</script>

<DataGrid {data.rows} columns={data.columnsMeta.map(c => ({ key: c.name, name: c.name }))} />
