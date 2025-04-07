import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// ESモジュールで__dirnameを使うための設定
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// テスト用ポートを定義 - これを明示的に指定
const TEST_PORT = '7080';
// Tinylicious サーバーのポートを定義（PORT環境変数で設定されます）
const TINYLICIOUS_PORT = '7082';

export default defineConfig({
	testDir: './e2e',
	testMatch: '**/*.spec.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: [['html', { open: 'never' }]],
	headless: true,

	// globalSetupとglobalTeardown - require.resolveではなく相対パスを使用
	globalSetup: path.join(__dirname, './e2e/global-setup.ts'),
	globalTeardown: path.join(__dirname, './e2e/global-teardown.ts'),

	use: {
		// テスト用ポートを明示的に設定
		baseURL: `http://192.168.50.16:${TEST_PORT}`,
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
		command: `npx dotenv -e .env.test -- npm run dev -- --host 0.0.0.0 --port ${TEST_PORT}`,
		url: `http://192.168.50.16:${TEST_PORT}`,
		reuseExistingServer: !process.env.CI,
		env: {
			NODE_ENV: 'test',
			VITE_USE_TINYLICIOUS: 'true',
			VITE_FORCE_AZURE: 'false',
			VITE_IS_TEST: 'true', // 明示的にテスト環境フラグを設定
			// ポートを明示的に設定
			VITE_PORT: TEST_PORT,
			// TinyliciousのポートをVITE_TINYLICIOUS_PORTとして設定
			// global-setup.tsではこの値を取得してPORT環境変数に設定します
			VITE_TINYLICIOUS_PORT: TINYLICIOUS_PORT
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
