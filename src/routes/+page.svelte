<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { FluidClient } from '../fluid/fluidClient';
  import { getDebugConfig } from '../lib/env';

  let fluidClient: FluidClient;
  let text = "";
  let inputText = "";
  let debugInfo: any = {};
  let showDebugPanel = false;
  let hostInfo = "";
  let envConfig = getDebugConfig();
  let treeData: any = {};

  // VSCodeからアクセス可能なグローバル変数
  let _vscodeDebugContext: any = {};

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
      
      // 内部デバッグコンテキストを設定
      _vscodeDebugContext = {
        client: fluidClient,
        updateDebugInfo: updateDebugInfo
      };
      
      // 初期データの設定例
      fluidClient.setData("appName", "Outliner");
      fluidClient.setData("debugAttached", true);
      
      // 共有テキストの監視と更新
      // sharedString プロパティが未実装のため、この部分をコメントアウトまたは修正
      /* if (fluidClient.sharedString) {
        fluidClient.sharedString.on("sequenceDelta", () => {
          text = fluidClient.getText();
          updateDebugInfo();
        });
      } */
      
      // 初期TreeDataを取得
      treeData = fluidClient.getAllData();
      
      // デバッグ情報の初期化
      updateDebugInfo();

      // 環境変数情報も保存
      fluidClient.setData("debugConfig", envConfig);
    } catch (error) {
      console.error("[+page] Error initializing FluidClient:", error);
      // VSCode debugger用にエラーをキャプチャ
      // debugger;
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
    if (fluidClient) {
      fluidClient.insertText(0, inputText + "\n");
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

  // SharedTreeの初期化コードを更新
  // const treeConfig = new TreeConfiguration();
  // const tree = new SharedTree(treeConfig);
</script>

<main>
  <h1>Fluid Framework with Azure Fluid Relay</h1>
  <p>Welcome to your Azure Fluid Relay powered application!</p>
  <p class="host-info">Running on: {hostInfo}</p>
  
  <div class="input-section">
    <input 
      type="text" 
      bind:value={inputText} 
      placeholder="Enter text to share"
      class="border p-2 rounded"
    />
    <button 
      on:click={handleInput}
      class="bg-blue-500 text-white p-2 rounded ml-2"
    >
      Add Text
    </button>
    <button
      on:click={toggleDebugPanel}
      class="bg-purple-500 text-white p-2 rounded ml-2"
    >
      {showDebugPanel ? 'Hide' : 'Show'} Debug
    </button>
  </div>

  <div class="shared-content mt-4 p-4 border rounded">
    <h2>Shared Content:</h2>
    <div class="mb-4">
      <h3>Shared Text:</h3>
      <pre>{text}</pre>
    </div>
    
    <div class="mt-4">
      <h3>Shared Tree Data:</h3>
      <pre class="text-left">{JSON.stringify(treeData, null, 2)}</pre>
    </div>
  </div>
  
  {#if showDebugPanel}
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
</style>
