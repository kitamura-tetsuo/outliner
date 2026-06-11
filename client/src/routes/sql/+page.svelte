<script lang="ts">
import QueryEditor from '../../components/QueryEditor.svelte';
import EditableQueryGrid from '../../components/EditableQueryGrid.svelte';
import ChartPanel from '../../components/ChartPanel.svelte';
import { onMount } from 'svelte';
import { initDb } from '../../services/sqlService';

onMount(async () => {
    await initDb();
});
</script>

<QueryEditor />
<EditableQueryGrid />
<ChartPanel />
