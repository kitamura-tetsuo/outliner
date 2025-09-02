<script lang="ts">
import OutlinerBase from "../../components/OutlinerBase.svelte";
import { Project } from "../../schema/app-schema";
import { store as generalStore } from "../../stores/store.svelte";
import { connectProjectDoc } from "$lib/yjs/connection";
import * as Y from "yjs";
import { onMount } from "svelte";

let proj = $state<Project | undefined>(undefined);
let pageItem = $state<any>(undefined);

const PROJECT_ID = "yjs-outliner-test";

onMount(async () => {
  // 1) Create local doc immediately for UI rendering (server optional)
  const doc = new Y.Doc({ guid: PROJECT_ID });
  const p = Project.fromDoc(doc);
  if ((p.items as any).length === 0) {
    const pg = p.addPage("Untitled", "tester");
    while ((pg.items as any)?.length < 3) pg.items.addNode("tester");
  }
  proj = p;
  pageItem = (p.items as any).at(0);
  generalStore.project = p as any;
  generalStore.currentPage = pageItem;
  console.log("/yjs-outliner: pageItem set", { hasPageItem: !!pageItem });

  // 2) Connect to server in background; UI continues offline if auth not ready
  try { await connectProjectDoc(doc, PROJECT_ID); } catch {}
});
</script>

<div class="outliner-page">
  {#if pageItem}
    <OutlinerBase pageItem={pageItem} projectName="test" pageName="page" />
  {/if}
</div>

<style>
.outliner-page { padding: 8px; }
</style>
