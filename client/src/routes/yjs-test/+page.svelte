<script lang="ts">
import * as Y from "yjs";
import { onMount } from "svelte";
import { Project } from "../../schema/app-schema";

let proj: Project;
let itemText = $state("");
let yText: Y.Text;
let hydrated = $state(false);

onMount(() => {
  proj = Project.createInstance("Test");
  const page = proj.addPage("", "u");
  yText = page.text;
  itemText = yText.toString();

  // Yjs -> UI: yTextの変更を監視
  const observer = () => {
    itemText = yText.toString();
  };
  yText.observe(observer);

  return () => {
    yText.unobserve(observer);
  };
});

// UI(itemText) -> Yjs(yText): 反映エフェクト
$effect(() => {
  if (!yText) return;
  const v = itemText;
  const cur = yText.toString();
  if (v !== cur) {
    if (cur.length) yText.delete(0, cur.length);
    if (v) yText.insert(0, v);
  }
});

function handleInput(e: Event) {
  // 入力時に itemText を更新（Svelte5では oninput 属性を推奨）
  itemText = (e.target as HTMLInputElement).value;
}

function updateFromYjs() {
  const next = "updated-by-yjs";
  const cur = yText.toString();
  if (cur.length) yText.delete(0, cur.length);
  yText.insert(0, next);
}
</script>

<div>
  <input id="yjs-input" bind:value={itemText} />
  <button id="yjs-update" onclick={updateFromYjs}>Yjs更新</button>
  <div id="yjs-output">{itemText}</div>
</div>

<style>
#yjs-input { border: 1px solid #ccc; padding: 4px; }
#yjs-output { margin-top: 8px; }
</style>

