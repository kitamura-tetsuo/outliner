<script lang="ts">
let { projectId }: { projectId?: string; } = $props();
</script>

<!-- Test-only stand-in for YjsTableView; see page.svelte.test.ts. -->
<div data-testid="table-view-stub" data-project-id={projectId}></div>
