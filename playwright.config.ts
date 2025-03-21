import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		// 開発サーバーを使用する方法に変更
		command: 'npm run dev',
		port: 5173,
		reuseExistingServer: true,
	},

	testDir: 'e2e',

	// テスト実行時の設定
	use: {
		headless: true, // ヘッドレスモードを強制的に有効化
		actionTimeout: 15000,
		navigationTimeout: 30000,
		launchOptions: {
			args: ['--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox']
		},
	},

	// プロジェクトごとの設定
	projects: [
		{
			name: 'chromium',
			use: {
				browserName: 'chromium',
				headless: true // プロジェクト設定でもヘッドレスモードを強制
			},
		},
	],

	// テスト結果のレポート設定
	reporter: [
		['html', { outputFolder: 'playwright-report' }],
		['list']
	],
});
