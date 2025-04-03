<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { UserManager } from '../../auth/UserManager';
	import AuthComponent from '../../components/AuthComponent.svelte';
	import { FluidClient } from '../../fluid/fluidClient';
	import { fluidClient } from '../../stores/fluidStore';
	import { getEnv } from '../../lib/env';

	let isLoading = false;
	let error: string | null = null;
	let success: string | null = null;
	let containerName = '';
	let isAuthenticated = false;
	let createdContainerId: string | null = null;

	// 認証成功時の処理
	async function handleAuthSuccess(authResult) {
		console.log('認証成功:', authResult);
		isAuthenticated = true;
	}

	// 認証ログアウト時の処理
	function handleAuthLogout() {
		console.log('ログアウトしました');
		isAuthenticated = false;
	}

	// 新規コンテナを作成する
	async function createNewContainer() {
		if (!containerName.trim()) {
			error = 'コンテナ名を入力してください';
			return;
		}

		isLoading = true;
		error = null;
		success = null;

		try {
			// 現在のFluidClientインスタンスを破棄してリセット
			if ($fluidClient) {
				$fluidClient.dispose();
				fluidClient.set(null);
			}

			// 新しいFluidClientインスタンスを取得
			const client = FluidClient.getInstance();
			
			// コンテナIDをリセットして新規作成モードにする
			client.resetContainerId();
			
			// クライアントを初期化（新規コンテナが作成される）
			await client.initialize();
			
			// 作成されたコンテナIDを取得
			createdContainerId = client.containerId;
			
			// fluidClientストアを更新
			fluidClient.set(client);
			
			success = `新しいコンテナが作成されました！ (ID: ${createdContainerId})`;
			
			// 1秒後にメインページに移動
			setTimeout(() => {
				goto('/');
			}, 2000);
			
		} catch (err) {
			console.error('新規コンテナ作成エラー:', err);
			error = err instanceof Error ? err.message : '新規コンテナの作成中にエラーが発生しました。';
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		// UserManagerの認証状態を確認
		const userManager = UserManager.getInstance();
		isAuthenticated = userManager.getCurrentUser() !== null;
	});

	onDestroy(() => {
		// 必要に応じてクリーンアップコード
	});
</script>

<svelte:head>
	<title>新規コンテナ作成 - Fluid Outliner</title>
</svelte:head>

<main class="container mx-auto px-4 py-8">
	<h1 class="mb-6 text-3xl font-bold text-center">新規アウトライナーの作成</h1>

	<div class="auth-section mb-8">
		<AuthComponent onAuthSuccess={handleAuthSuccess} onAuthLogout={handleAuthLogout} />
	</div>

	{#if isAuthenticated}
		<div class="bg-white p-6 rounded-lg shadow-md max-w-md mx-auto">
			<h2 class="text-xl font-semibold mb-4">新しいアウトライナーを作成</h2>
			
			<div class="mb-4">
				<label for="containerName" class="block text-sm font-medium text-gray-700 mb-1">
					アウトライナー名
				</label>
				<input
					type="text"
					id="containerName"
					bind:value={containerName}
					placeholder="マイアウトライナー"
					class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
				/>
			</div>

			{#if error}
				<div class="mb-4 p-3 bg-red-100 text-red-700 rounded-md" role="alert">
					{error}
				</div>
			{/if}

			{#if success}
				<div class="mb-4 p-3 bg-green-100 text-green-700 rounded-md" role="alert">
					{success}
				</div>
			{/if}

			<button
				on:click={createNewContainer}
				disabled={isLoading}
				class="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors {isLoading ? 'opacity-70 cursor-not-allowed' : ''}"
			>
				{#if isLoading}
					<span class="inline-block animate-spin mr-2">⏳</span> 作成中...
				{:else}
					作成する
				{/if}
			</button>

			{#if createdContainerId}
				<div class="mt-4 p-3 bg-gray-100 rounded-md">
					<p class="text-sm text-gray-700">
						作成されたコンテナID: <code class="bg-gray-200 px-1 py-0.5 rounded">{createdContainerId}</code>
					</p>
				</div>
			{/if}
		</div>
	{:else}
		<div class="bg-yellow-50 p-6 rounded-lg shadow-md max-w-md mx-auto">
			<h2 class="text-xl font-semibold mb-2">認証が必要です</h2>
			<p class="text-gray-700 mb-4">
				新しいアウトライナーを作成するには、まず上部のログインボタンからログインしてください。
			</p>
		</div>
	{/if}

	<div class="mt-6 text-center">
		<a
			href="/"
			class="text-blue-600 hover:text-blue-800 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md px-2 py-1"
		>
			ホームに戻る
		</a>
	</div>
</main>

<style>
	/* スタイリングが必要な場合は追加 */
</style>