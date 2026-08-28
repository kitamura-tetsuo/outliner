<!-- Test-only stand-in for YjsTableView; see page.svelte.test.ts. -->
<script lang="ts">
interface Props {
    grid: { gridId: string };
    handles: { tableId?: string };
}
let { grid, handles }: Props = $props();
</script>

<div data-testid="grid-view-stub" data-grid-id={grid.gridId} data-source-table-id={handles.tableId}></div>
