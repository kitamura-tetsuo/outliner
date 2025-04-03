import { paraglide } from '@inlang/paraglide-sveltekit/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
	// デフォルトの環境変数を読み込み
	process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };

	// テスト環境の場合は.env.testから環境変数を上書き
	if (mode === 'test' || process.env.NODE_ENV === 'test') {
		console.log('Loading test environment variables from .env.test');
		process.env = {
			...process.env,
			...loadEnv('test', process.cwd(), '')
		};
	}

	return {
		plugins: [
			tailwindcss(),
			sveltekit(),
			paraglide({
				project: './project.inlang',
				outdir: './src/lib/paraglide'
			})
		],
		server: {
			port: parseInt(process.env.VITE_PORT || '7071'),
			strictPort: true,
			host: process.env.VITE_HOST || 'localhost'
		},
		preview: {
			port: parseInt(process.env.VITE_PORT || '7071'),
			strictPort: true,
			host: process.env.VITE_HOST || 'localhost'
		},
		test: {
			workspace: [
				{
					extends: './vite.config.ts',
					plugins: [svelteTesting()],

					test: {
						name: 'client',
						environment: 'jsdom',
						clearMocks: true,
						include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
						exclude: ['src/lib/server/**'],
						setupFiles: ['./vitest-setup-client.ts'],
						envFile: '.env.test',
					}
				},
				{
					extends: './vite.config.ts',

					test: {
						name: 'server',
						environment: 'node',
						include: ['src/**/*.{test,spec}.{js,ts}'],
						exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
					}
				}
			]
		}
	}
});
