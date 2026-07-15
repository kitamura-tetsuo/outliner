<script lang="ts">
import { onMount } from "svelte";
import ChartPanel from "../../components/ChartPanel.svelte";
import EditableQueryGrid from "../../components/EditableQueryGrid.svelte";
import QueryEditor from "../../components/QueryEditor.svelte";
import { initDb } from "../../services/sqlService";

onMount(async () => {
    await initDb();
});
</script>

<QueryEditor />
<EditableQueryGrid />
<ChartPanel />
