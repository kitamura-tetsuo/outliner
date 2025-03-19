<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { FluidClient } from '../fluid/fluidClient';
  import { getDebugConfig } from '../lib/env';
  import OutlinerTree from '../components/OutlinerTree.svelte';

  let fluidClient: FluidClient;
  let inputText = "";
  let debugInfo: any = {};
  let showDebugPanel = false;
  let hostInfo = "";
  let envConfig = getDebugConfig();
  let treeData: any = {};
  let rootItems; // アウトラインのルートアイテム

  // SharedTreeの変更を監視するためのハンドラ
  function handleTreeChanged(event: CustomEvent) {
    treeData = event.detail.data;
    updateDebugInfo();
  }

  onMount(async () => {
    console.debug("[+page] Component mounted");
    
    // ホスト情報を取得
    if (typeof window !== 'undefined') {
      hostInfo = `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;
      console.info("Running on host:", hostInfo);
      
      // SharedTreeの変更イベントをリッスン
      window.addEventListener('fluidTreeChanged', handleTreeChanged as EventListener);
    }
    
    try {
      fluidClient = new FluidClient();
      await fluidClient.initialize();
      
      // VSCodeデバッガーのためのグローバル参照
      if (typeof window !== 'undefined') {
        (window as any).__FLUID_CLIENT__ = fluidClient;
        console.info("FluidClient attached to window.__FLUID_CLIENT__ for VSCode debugging");
      }
      
      // Outlinerで使用するrootItemsを設定
      rootItems = fluidClient.getTree();
      
      // 初期データの設定
      fluidClient.setData?.("appName", "Outliner");
      fluidClient.setData?.("debugAttached", true);
      
      // 初期TreeDataを取得
      treeData = fluidClient.getAllData();
      
      // デバッグ情報の初期化
      updateDebugInfo();

      // 環境変数情報も保存
      fluidClient.setData?.("debugConfig", envConfig);
    } catch (error) {
      console.error("[+page] Error initializing FluidClient:", error);
    }
  });
  
  onDestroy(() => {
    console.debug("[+page] Component destroying");
    // イベントリスナーのクリーンアップ
    if (typeof window !== 'undefined') {
      window.removeEventListener('fluidTreeChanged', handleTreeChanged as EventListener);
      delete (window as any).__FLUID_CLIENT__;
    }
  });

  function handleInput() {
    console.debug("[+page] Adding text:", inputText);
    if (fluidClient && inputText) {
      // ここにテキスト追加処理を実装
      inputText = "";
      updateDebugInfo();
    }
  }
  
  function updateDebugInfo() {
    if (fluidClient) {
      debugInfo = fluidClient.getDebugInfo();
    }
  }
  
  function toggleDebugPanel() {
    showDebugPanel = !showDebugPanel;
    updateDebugInfo();
  }
</script>

<main>
  <h1>Workflowy/Scrapbox Style Outliner</h1>
  <p class="host-info">Running on: {hostInfo}</p>
  
  {#if rootItems}
    <OutlinerTree rootItems={rootItems} />
  {:else}
    <div class="loading">
      <p>Loading shared data...</p>
    </div>
  {/if}
  
  <button
    on:click={toggleDebugPanel}
    class="bg-purple-500 text-white p-2 rounded mt-4"
  >
    {showDebugPanel ? 'Hide' : 'Show'} Debug
  </button>
  
  {#if showDebugPanel}
    <!-- 既存のデバッグパネル -->
    <div class="debug-panel mt-4 p-4 border rounded bg-gray-50">
      <h3>Debug Info (VSCode)</h3>
      <div class="text-left text-xs mt-2">
        <details>
          <summary>環境設定</summary>
          <pre>{JSON.stringify(envConfig, null, 2)}</pre>
        </details>
        <details open>
          <summary>Fluidクライアント</summary>
          <pre>{JSON.stringify(debugInfo, null, 2)}</pre>
        </details>
      </div>
      <p class="text-xs mt-2">
        VSCodeでデバッグするには:<br>
        1. F5キーでデバッグを開始<br>
        2. コンソールで<code>window.__FLUID_CLIENT__</code>にアクセス
      </p>
    </div>
  {/if}
</main>

<style>
  main {
    text-align: center;
    padding: 1em;
    max-width: 800px;
    margin: 0 auto;
  }

  h1 {
    color: #ff3e00;
  }

  .input-section {
    margin: 20px 0;
  }

  .shared-content {
    text-align: left;
    background-color: #f9f9f9;
    min-height: 200px;
  }
  
  code {
    background: #eee;
    padding: 2px 4px;
    border-radius: 3px;
    font-family: monospace;
  }

  .host-info {
    font-size: 0.8em;
    color: #666;
    margin-bottom: 1em;
  }

  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 200px;
    background: #f9f9f9;
    border-radius: 8px;
    margin-top: 20px;
  }
</style>
