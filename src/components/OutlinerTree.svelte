<script lang="ts">
  import { onMount } from "svelte";
  import { fluidClient } from "../stores/fluidStore";
  import OutlinerItem from "./OutlinerItem.svelte";
  import { Items } from "../schema/app-schema";
  import { Tree } from "fluid-framework";
  
  export let rootItems: Items;
  
  let currentUser = "anonymous";
  let items = [];
  
  onMount(() => {
    if ($fluidClient?.currentUser) {
      currentUser = $fluidClient.currentUser.id;
    }
    debugger;
    
    // 初期アイテムのロード
    updateItems();
    
    // アイテムの変更を監視
    const unsubscribe =　Tree.on(rootItems, "nodeChanged", updateItems);
    
    return () => {
      unsubscribe();
    };
  });
  
  function updateItems() {
    // rootItemsの変更を反映
    items = [...rootItems];
		console.log(items);
  }
  
  function handleAddItem() {
    rootItems.addNode(currentUser);
  }
  
  function handleAddGroup() {
    rootItems.addGroup("新しいグループ");
  }
  
  function handleAddAfter(event) {
    const { after } = event.detail;
    // 親アイテムを見つけて、その後ろに新しいアイテムを追加
    const parent = rootItems; // 本来はTree.parent(after)を使うべきだが、ここではrootItemsとする
    if (parent) {
      const index = parent.indexOf(after);
      if (index !== -1) {
        const newNote = rootItems.addNode(currentUser);
        // 本来はここで挿入位置を調整すべき
      }
    }
  }
  
  function handleIndent(event) {
    // インデントを増やす処理（未実装）
    console.log("Indent", event.detail);
  }
  
  function handleUnindent(event) {
    // インデントを減らす処理（未実装）
    console.log("Unindent", event.detail);
  }
</script>

<div class="outliner">
  <div class="toolbar">
    <h2>アウトライン</h2>
    <div class="actions">
      <button on:click={handleAddItem}>アイテム追加</button>
      <button on:click={handleAddGroup}>グループ追加</button>
    </div>
  </div>
  
  <div class="tree-container">
    {#each items as item}
      <OutlinerItem 
        item={item}
        currentUser={currentUser}
        on:add={handleAddAfter}
        on:indent={handleIndent}
        on:unindent={handleUnindent}
      />
    {/each}
    
    {#if items.length === 0}
      <div class="empty-state">
        <p>アイテムがありません。「アイテム追加」ボタンを押して始めましょう。</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .outliner {
    background: white;
    border: 1px solid #ddd;
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 20px;
  }
  
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    background: #f5f5f5;
    border-bottom: 1px solid #ddd;
  }
  
  .toolbar h2 {
    margin: 0;
    font-size: 18px;
  }
  
  .actions {
    display: flex;
    gap: 8px;
  }
  
  .actions button {
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 14px;
    cursor: pointer;
  }
  
  .actions button:hover {
    background: #f0f0f0;
  }
  
  .tree-container {
    padding: 10px;
    min-height: 200px;
  }
  
  .empty-state {
    color: #888;
    text-align: center;
    padding: 20px;
  }
</style>
