<script lang="ts">
import OutlinerBase from "../../components/OutlinerBase.svelte";
import { Project } from "../../schema/app-schema";
import { store as generalStore } from "../../stores/store.svelte";
import * as Y from "yjs";
import { onMount } from "svelte";

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
  pageItem = (p.items as any).at(0);
  generalStore.project = p as any;
  generalStore.currentPage = pageItem;
  console.log("/yjs-outliner: pageItem set", { hasPageItem: !!pageItem });

  // 2) Connect to server in background; UI continues offline if auth not ready
  //    Import connection module only on client to avoid SSR crashes
  try {
    const { connectProjectDoc } = await import("$lib/yjs/connection");
    await connectProjectDoc(doc, PROJECT_ID);
  } catch (e) {
    console.warn("/yjs-outliner: connectProjectDoc failed (continuing offline)", e);
  }
});
</script>

<div class="outliner-page" data-testid="yjs-outliner-page">
  <!-- Ensure an early anchor exists for tests -->
  <OutlinerBase pageItem={pageItem} projectName="test" pageName="page" />
</div>

<style>
.outliner-page { padding: 8px; }
</style>
