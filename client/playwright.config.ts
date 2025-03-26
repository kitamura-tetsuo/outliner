import { defineConfig, devices } from '@playwright/test';

// テスト用ポートを定義 - これを明示的に指定
const TEST_PORT = '5174';

export default defineConfig({
	testDir: './e2e',
	testMatch: '**/*.spec.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'html',

	use: {
		// テスト用ポートを明示的に設定
		baseURL: `http://localhost:${TEST_PORT}`,
		trace: 'on-first-retry',
	},

	projects: [
		{
			// コアテスト: 認証不要の基本機能テスト
			name: 'core',
			testDir: './e2e/core',
			use: { ...devices['Desktop Chrome'] },
		},
		{
			// 認証テスト: 本番環境でのみ実行
			name: 'auth',
			testDir: './e2e/auth',
			use: { ...devices['Desktop Chrome'] },
		},
	],

	webServer: {
		command: `npx dotenv -e .env.test -- npm run dev -- --port ${TEST_PORT}`,
		url: `http://localhost:${TEST_PORT}`,
		reuseExistingServer: !process.env.CI,
		env: {
			NODE_ENV: 'test',
			VITE_USE_TINYLICIOUS: 'true',
			VITE_FORCE_AZURE: 'false',
			VITE_IS_TEST: 'true', // 明示的にテスト環境フラグを設定
			// ポートを明示的に設定
			VITE_PORT: TEST_PORT
		},
		// ready文字列を指定して、Viteサーバーの準備完了を検知
		stdout: 'pipe',
		stderr: 'pipe',
		// Viteの "ready in" メッセージを待機
		readyCondition: {
			pattern: 'ready in',
			flags: 'i'
		},
		// タイムアウトは開発サーバーが通常起動する時間より少し長めに設定
		timeout: 60000,
	},
});
