<!-- Test-only stand-in for YjsTableView; see page.svelte.test.ts. -->
<script lang="ts">
interface Props {
    grid: { gridId: string };
    handles: { tableId?: string };
    placementId?: string;
    pageId?: string;
    pageTitle?: string;
}
let { grid, handles, placementId, pageId, pageTitle }: Props = $props();
</script>

<div
    data-testid="grid-view-stub"
    data-grid-id={grid.gridId}
    data-source-table-id={handles.tableId}
    data-placement-id={placementId}
    data-page-id={pageId}
    data-page-title={pageTitle}
></div>
