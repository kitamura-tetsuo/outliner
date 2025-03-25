<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { getEnv } from '../lib/env';

	const dispatch = createEventDispatcher();

	let apiBaseUrl = '';
	let isLoading = false;
	let error = '';

	onMount(() => {
		// APIのベースURL設定を環境変数から取得
		apiBaseUrl = getEnv('VITE_API_BASE_URL', 'http://localhost:3000');

		// URLからsessionIdパラメータを取得
		const urlParams = new URLSearchParams(window.location.search);
		const sessionId = urlParams.get('sessionId');

		if (sessionId) {
			handleSessionValidation(sessionId);
		}
	});

	async function handleSessionValidation(sessionId: string) {
		try {
			isLoading = true;
			error = '';

			// セッション情報を検証
			const response = await fetch(`${apiBaseUrl}/api/session-info?sessionId=${sessionId}`);

			if (!response.ok) {
				throw new Error('セッション検証に失敗しました');
			}

			const data = await response.json();

			// URLからsessionIdパラメータを削除（履歴は残る）
			const url = new URL(window.location.href);
			url.searchParams.delete('sessionId');
			window.history.replaceState({}, document.title, url.toString());

			// ユーザー情報とセッションIDをイベントで送信
			dispatch('authSuccess', {
				sessionId,
				user: data.user
			});
		} catch (err) {
			console.error('Session validation error:', err);
			error = err.message || 'セッション検証中にエラーが発生しました';
		} finally {
			isLoading = false;
		}
	}

	function loginWithGoogle() {
		// Google認証ページにリダイレクト
		window.location.href = `${apiBaseUrl}/auth/google`;
	}
</script>

<div class="google-auth-container">
	{#if isLoading}
		<div class="loading">
			<p>認証情報を確認中...</p>
		</div>
	{:else if error}
		<div class="error">
			<p>{error}</p>
			<button on:click={() => (error = '')} class="try-again">再試行</button>
		</div>
	{:else}
		<button on:click={loginWithGoogle} class="google-btn" disabled={isLoading}>
			<span class="google-icon">
				<svg viewBox="0 0 24 24" width="18" height="18">
					<path
						d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
						fill="#4285F4"
					/>
					<path
						d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
						fill="#34A853"
					/>
					<path
						d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
						fill="#FBBC05"
					/>
					<path
						d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
						fill="#EA4335"
					/>
				</svg>
			</span>
			Googleでログイン
		</button>
	{/if}
</div>

<style>
	.google-auth-container {
		margin: 1rem 0;
	}

	.google-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: white;
		color: #737373;
		border: 1px solid #ccc;
		border-radius: 4px;
		padding: 0.75rem 1rem;
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.3s;
		width: 100%;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.google-btn:hover {
		background-color: #f8f8f8;
	}

	.google-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.google-icon {
		margin-right: 0.5rem;
	}

	.loading {
		text-align: center;
		padding: 0.75rem;
		background-color: #f0f8ff;
		border-radius: 4px;
	}

	.error {
		color: #d32f2f;
		padding: 0.75rem;
		background-color: #ffebee;
		border-radius: 4px;
		margin-bottom: 1rem;
	}

	.try-again {
		background-color: transparent;
		border: none;
		color: #1976d2;
		text-decoration: underline;
		cursor: pointer;
		padding: 0;
	}
</style>
