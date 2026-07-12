<script lang="ts">
import EditableQueryGrid from "./EditableQueryGrid.svelte";
import ChartQueryEditor from "./ChartQueryEditor.svelte";
import type { Item } from "../schema/app-schema";

interface Props {
    item: Item;
}

let { item }: Props = $props();
</script>

<div class="inline-join-table">
    <ChartQueryEditor {item} />
    <EditableQueryGrid {item} />
</div>

<style>
.inline-join-table {
    margin-top: 8px;
    border: 1px solid #ddd;
    padding: 8px;
}
</style>
