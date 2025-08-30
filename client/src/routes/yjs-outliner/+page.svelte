<script lang="ts">
import OutlinerBase from "../../components/OutlinerBase.svelte";
import { Project } from "../../schema/app-schema";
import { store as generalStore } from "../../stores/store.svelte";

let proj = Project.createInstance("YjsOutlinerTest");
let pageItem = proj.addPage("Untitled", "tester");
// 初期子アイテムを1つ追加しておく（E2E簡便のため）
pageItem.items.addNode("tester");

// GeneralStore にプロジェクトとカレントページを設定（Cursor 検索用）
generalStore.project = proj;
generalStore.currentPage = pageItem;
</script>

<div class="outliner-page">
  <OutlinerBase pageItem={pageItem} projectName="test" pageName="page" />
</div>

<style>
.outliner-page { padding: 8px; }
</style>

