<script lang="ts">
import type * as Y from "yjs";
import type { GridHandles } from "../../services/yjstable/gridDocs";
import YjsTableView from "./YjsTableView.svelte";
interface Props {
    grid: GridHandles;
    projectDoc: Y.Doc;
    projectId?: string;
    projectName?: string;
    placementId?: string;
    pageId?: string;
    pageTitle?: string;
    isReadOnly?: boolean;
    canWrite?: () => boolean;
}
let { grid, projectDoc, projectId, projectName, placementId, pageId, pageTitle, isReadOnly = false, canWrite }: Props =
    $props();
// Preserve the instance during the parent's disappearing-prop teardown.
// svelte-ignore state_referenced_locally
const mountedGrid = grid;
</script>

<YjsTableView grid={mountedGrid} {projectDoc} {projectId} {projectName} {placementId} {pageId} {pageTitle} {isReadOnly} {canWrite} />
