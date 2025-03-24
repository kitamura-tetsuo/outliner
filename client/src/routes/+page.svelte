<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import EnvDebugger from '../components/EnvDebugger.svelte';
	import MissingEnvWarning from '../components/MissingEnvWarning.svelte';
	import OutlinerTree from '../components/OutlinerTree.svelte';
	import UserRegistration from '../components/UserRegistration.svelte';
	import { authStore, initAuth } from '../lib/authService';
	import { getDebugConfig } from '../lib/env';
	import { handleConnectionError } from '../lib/fluidService';
	import { fluidClient } from '../stores/fluidStore';

	let isLoading = true;
	let error: string | null = null;
	let containerId: string | null = null;
	let inputText = '';
	let debugInfo: any = {};
	let showDebugPanel = false;
	let hostInfo = '';
	let envConfig = getDebugConfig();
	let treeData: any = {};
	let rootItems; // アウトラインのルートアイテム

	// SharedTreeの変更を監視するためのハンドラ
	function handleTreeChanged(event: CustomEvent) {
		treeData = event.detail.data;
		updateDebugInfo();
	}

	// 認証状態を確認
	$: isUserAuthenticated = $authStore.user !== null;

	onMount(async () => {
		// debugger

		console.debug('[+page] Component mounted');

		try {
			// 認証の初期化
			initAuth();

			// ホスト情報を取得
			if (typeof window !== 'undefined') {
				hostInfo = `${window.location.protocol}//${window.location.hostname}:${window.location.port}`;
				console.info('Running on host:', hostInfo);

				// SharedTreeの変更イベントをリッスン
				window.addEventListener('fluidTreeChanged', handleTreeChanged as EventListener);
			}

			// Fluidクライアントの初期化
			if (!$fluidClient) {
				error = 'Fluidクライアントが初期化されていません。';
				isLoading = false;
				return;
			}

			// コンテナIDの保存
			containerId = $fluidClient.containerId;

			// Outlinerで使用するrootItemsを設定
			rootItems = $fluidClient.getTree();

			// 初期データの設定
			$fluidClient.setData?.('appName', 'Outliner');
			$fluidClient.setData?.('debugAttached', true);

			// 初期TreeDataを取得
			treeData = $fluidClient.getAllData();

			// デバッグ情報の初期化
			updateDebugInfo();

			// 環境変数情報も保存
			$fluidClient.setData?.('debugConfig', envConfig);

			isLoading = false;
		} catch (err) {
			console.error('Error initializing page:', err);
			error = err instanceof Error ? err.message : '初期化中にエラーが発生しました。';
			isLoading = false;
		}
	});

	onDestroy(() => {
		console.debug('[+page] Component destroying');
		// イベントリスナーのクリーンアップ
		if (typeof window !== 'undefined') {
			window.removeEventListener('fluidTreeChanged', handleTreeChanged as EventListener);
			delete (window as any).__FLUID_CLIENT__;
		}
	});

	// Azure Fluid Relay接続テスト
	async function testConnection() {
		isLoading = true;
		error = null;

		try {
			if (!$fluidClient) {
				throw new Error('Fluidクライアントが初期化されていません。');
			}

			// コンテナの接続状態を確認
			const isConnected = $fluidClient.container?.connected || false;

			if (isConnected) {
				alert('接続テスト成功！コンテナは接続されています。');
			} else {
				alert('コンテナは接続されていません。');
			}
		} catch (err) {
			console.error('Connection test error:', err);
			error = await handleConnectionError(err);
		} finally {
			isLoading = false;
		}
	}

	function handleInput() {
		console.debug('[+page] Adding text:', inputText);
		if ($fluidClient && inputText) {
			// ここにテキスト追加処理を実装
			inputText = '';
			updateDebugInfo();
		}
	}

	function updateDebugInfo() {
		if ($fluidClient) {
			debugInfo = $fluidClient.getDebugInfo();
		}
	}

	function toggleDebugPanel() {
		showDebugPanel = !showDebugPanel;
		updateDebugInfo();
	}
</script>

<svelte:head>
	<title>Fluid Outliner App</title>
</svelte:head>

<main>
	<h1>Fluid Outliner App</h1>
	<p class="host-info">Running on: {hostInfo}</p>

	<!-- 環境変数の警告 -->
	<MissingEnvWarning />

	<!-- ユーザー認証コンポーネント -->
	<UserRegistration />

	<!-- 環境変数デバッガー -->
	<EnvDebugger />

	{#if isLoading}
		<div class="loading">読み込み中...</div>
	{:else if error}
		<div class="error">
			<p>エラー: {error}</p>
			<button on:click={() => location.reload()}>再読み込み</button>
		</div>
	{:else}
		<div class="connection-status">
			<div
				class="status-indicator {$fluidClient?.container?.connected ? 'connected' : 'disconnected'}"
			></div>
			<span>接続状態: {$fluidClient?.container?.connected ? '接続済み' : '未接続'}</span>
			<button on:click={testConnection}>接続テスト</button>
		</div>

		{#if containerId}
			<div class="container-info">
				<p>コンテナID: <code>{containerId}</code></p>
			</div>
		{/if}

		{#if rootItems}
			<OutlinerTree {rootItems} />
		{:else}
			<div class="loading">
				<p>Loading shared data...</p>
			</div>
		{/if}
	{/if}

	<button on:click={toggleDebugPanel} class="mt-4 rounded bg-purple-500 p-2 text-white">
		{showDebugPanel ? 'Hide' : 'Show'} Debug
	</button>

	{#if showDebugPanel}
		<!-- 既存のデバッグパネル -->
		<div class="debug-panel mt-4 rounded border bg-gray-50 p-4">
			<h3>Debug Info (VSCode)</h3>
			<div class="mt-2 text-left text-xs">
				<details>
					<summary>環境設定</summary>
					<pre>{JSON.stringify(envConfig, null, 2)}</pre>
				</details>
				<details open>
					<summary>Fluidクライアント</summary>
					<pre>{JSON.stringify(debugInfo, null, 2)}</pre>
				</details>
			</div>
			<p class="mt-2 text-xs">
				VSCodeでデバッグするには:<br />
				1. F5キーでデバッグを開始<br />
				2. コンソールで<code>window.__FLUID_CLIENT__</code>にアクセス
			</p>
		</div>
	{/if}

	<!-- デバッグ情報 -->
	<details>
		<summary>デバッグ情報</summary>
		<pre>{JSON.stringify($fluidClient?.getDebugInfo() || {}, null, 2)}</pre>
	</details>
</main>

<style>
	main {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem;
	}

	h1 {
		color: #333;
		text-align: center;
		margin-bottom: 2rem;
	}

	.loading {
		text-align: center;
		padding: 2rem;
		color: #666;
	}

	.error {
		background: #fff0f0;
		border: 1px solid #ffcccc;
		color: #d32f2f;
		padding: 1rem;
		border-radius: 4px;
		margin-bottom: 1rem;
	}

	.connection-status {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 1rem;
		padding: 0.5rem;
		background: #f5f5f5;
		border-radius: 4px;
	}

	.status-indicator {
		width: 12px;
		height: 12px;
		border-radius: 50%;
	}

	.connected {
		background: #4caf50;
	}

	.disconnected {
		background: #f44336;
	}

	.container-info {
		background: #f0f8ff;
		padding: 0.5rem 1rem;
		border-radius: 4px;
		margin-bottom: 1rem;
		border-left: 4px solid #2196f3;
	}

	code {
		font-family: monospace;
		background: #eee;
		padding: 2px 4px;
		border-radius: 3px;
	}

	details {
		margin-top: 2rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		padding: 0.5rem;
	}

	summary {
		cursor: pointer;
		padding: 0.5rem;
		font-weight: bold;
	}

	pre {
		background: #f5f5f5;
		padding: 1rem;
		overflow: auto;
		border-radius: 4px;
		font-size: 12px;
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
