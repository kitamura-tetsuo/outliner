<script lang="ts">
	import { i18n } from '$lib/i18n';
	import { ParaglideJS } from '@inlang/paraglide-sveltekit';
	import '../app.css';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { getEnv } from '$lib/env';
	import { getLogger } from '$lib/logger';

	let { children } = $props();
	const logger = getLogger('AppLayout');

	// APIサーバーのURLを取得
	const API_URL = getEnv('VITE_API_SERVER_URL', 'http://localhost:7071');

	/**
	 * ログファイルをローテーションする関数
	 */
	async function rotateLogFiles() {
		try {
			logger.info('アプリケーション起動時のログローテーションを実行します');
			const response = await fetch(`${API_URL}/api/rotate-logs`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (response.ok) {
				const result = await response.json();
				logger.info('ログローテーション完了', result);
			} else {
				logger.warn('ログローテーション失敗', { status: response.status });
			}
		} catch (error) {
			logger.error('ログローテーション中にエラーが発生しました', { error });
		}
	}

	// アプリケーション初期化時の処理
	onMount(() => {
		// ブラウザ環境でのみ実行
		if (browser) {
			// ログローテーションを実行
			rotateLogFiles();
		}
	});
</script>

<ParaglideJS {i18n}>
	{@render children()}
</ParaglideJS>
