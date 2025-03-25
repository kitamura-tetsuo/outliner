<script lang="ts">
	import { initializeApp } from 'firebase/app';
	import {
		getAuth,
		GoogleAuthProvider,
		onAuthStateChanged,
		signInWithPopup,
		signOut
	} from 'firebase/auth';
	import { createEventDispatcher, onMount } from 'svelte';
	import { getEnv } from '../lib/env';

	const dispatch = createEventDispatcher();

	let isLoading = true;
	let error = '';
	let user = null;
	let fluidToken = null;

	// Firebase設定
	const firebaseConfig = {
		apiKey: getEnv('VITE_FIREBASE_API_KEY', ''),
		authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN', ''),
		projectId: getEnv('VITE_FIREBASE_PROJECT_ID', ''),
		storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET', ''),
		messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', ''),
		appId: getEnv('VITE_FIREBASE_APP_ID', '')
	};

	const apiBaseUrl = getEnv('VITE_API_BASE_URL', 'http://localhost:3000');

	// Firebase初期化
	const app = initializeApp(firebaseConfig);
	const auth = getAuth(app);

	// Azure Fluid Relayトークンを取得
	async function getFluidToken(idToken) {
		try {
			const response = await fetch(`${apiBaseUrl}/api/fluid-token`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ idToken })
			});

			if (!response.ok) {
				throw new Error('Fluid Relayトークンの取得に失敗しました');
			}

			return await response.json();
		} catch (err) {
			console.error('Fluid token error:', err);
			throw err;
		}
	}

	onMount(() => {
		// Firebase認証状態の監視
		const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
			try {
				isLoading = true;

				if (firebaseUser) {
					// ユーザーが認証済みの場合、IDトークンを取得
					const idToken = await firebaseUser.getIdToken();

					// Fluid Relayトークンを取得
					const tokenResult = await getFluidToken(idToken);

					user = {
						uid: firebaseUser.uid,
						displayName: firebaseUser.displayName,
						email: firebaseUser.email,
						photoURL: firebaseUser.photoURL
					};

					fluidToken = tokenResult;

					// 認証成功イベントを発火
					dispatch('authSuccess', {
						user,
						fluidToken
					});
				} else {
					user = null;
					fluidToken = null;
				}
			} catch (err) {
				console.error('認証エラー:', err);
				error = err.message || '認証中にエラーが発生しました';
			} finally {
				isLoading = false;
			}
		});

		// コンポーネントのクリーンアップ時に監視を解除
		return () => unsubscribe();
	});

	async function loginWithGoogle() {
		try {
			isLoading = true;
			error = '';

			const provider = new GoogleAuthProvider();

			// 開発環境向けの設定を追加
			if (import.meta.env.DEV) {
				console.log('Development mode: Adding custom parameters for Google Auth');
				// ローカル開発環境ではカスタムパラメータを追加
				provider.setCustomParameters({
					// ログインを強制し、アカウント選択画面を表示
					prompt: 'select_account'
				});
			}

			await signInWithPopup(auth, provider);

			// onAuthStateChangedで残りの処理が行われる
		} catch (err) {
			console.error('Google認証エラー:', err);
			error = err.message || 'Google認証中にエラーが発生しました';
			isLoading = false;
		}
	}

	async function logout() {
		try {
			isLoading = true;
			error = '';

			await signOut(auth);
			user = null;
			fluidToken = null;

			dispatch('authLogout');
		} catch (err) {
			console.error('ログアウトエラー:', err);
			error = err.message || 'ログアウト中にエラーが発生しました';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="firebase-auth-container">
	{#if isLoading}
		<div class="loading">
			<p>認証情報を確認中...</p>
		</div>
	{:else if error}
		<div class="error">
			<p>{error}</p>
			<button on:click={() => (error = '')} class="try-again">再試行</button>
		</div>
	{:else if user}
		<div class="user-info">
			{#if user.photoURL}
				<img src={user.photoURL} alt={user.displayName} class="avatar" />
			{/if}
			<div class="user-details">
				<p class="user-name">{user.displayName}</p>
				<p class="user-email">{user.email}</p>
			</div>
			<button on:click={logout} class="logout-btn">ログアウト</button>
		</div>
	{:else}
		<button on:click={loginWithGoogle} class="google-btn">
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
	.firebase-auth-container {
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

	.user-info {
		display: flex;
		align-items: center;
		padding: 0.75rem;
		background-color: #f5f5f5;
		border-radius: 4px;
	}

	.avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		margin-right: 0.75rem;
	}

	.user-details {
		flex: 1;
	}

	.user-name {
		font-weight: 500;
		margin: 0;
	}

	.user-email {
		font-size: 0.85rem;
		color: #666;
		margin: 0;
	}

	.logout-btn {
		background-color: transparent;
		color: #d32f2f;
		border: 1px solid #d32f2f;
		border-radius: 4px;
		padding: 0.5rem 0.75rem;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.3s;
	}

	.logout-btn:hover {
		background-color: #ffebee;
	}
</style>
