import { paraglide } from "@inlang/paraglide-sveltekit/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { svelteTesting } from "@testing-library/svelte/vite";
import {
    defineConfig,
    loadEnv,
} from "vite";

export default defineConfig(async ({ mode }) => {
    // dotenvxで環境変数を読み込み（ESモジュール対応）
    const { config } = await import("@dotenvx/dotenvx");

    // デフォルトの環境変数を読み込み
    process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };

    // テスト環境の場合は.env.testから環境変数を上書き
    if (mode === "test" || process.env.NODE_ENV === "test") {
        console.log("Loading test environment variables from .env.test");
        config({ path: [".env.test"] });
        process.env = {
            ...process.env,
            ...loadEnv("test", process.cwd(), ""),
        };
    } else if (mode === "development") {
        console.log("Loading development environment variables from .env.development");
        config({ path: [".env.development"] });
    }

    return {
    optimizeDeps: {
      include: ['sqlite-wasm-kysely']
    },
        plugins: [
            tailwindcss(),
            sveltekit(),
            paraglide({
                project: "./project.inlang",
                outdir: "./src/lib/paraglide",
            }),
        ],
        server: {
            // エミュレータ利用時は 7090、クラウド環境では環境変数で上書き
            port: parseInt(process.env.VITE_PORT || "7090"),
            strictPort: true,
            host: process.env.VITE_HOST || "localhost",
        },
        preview: {
            port: parseInt(process.env.VITE_PORT || "7090"),
            strictPort: true,
            host: process.env.VITE_HOST || "localhost",
        },
        build: {
            sourcemap: true,
        },
        test: {
            // Add coverage configuration here
            coverage: {
                provider: 'v8', // or 'istanbul'
                reporter: ['text', 'html', 'lcov'],
                reportsDirectory: './coverage/vitest', // Output directory for coverage reports
                all: true, // Include all files, not just tested ones
                include: ['src/**/*.{js,ts,svelte}'], // Specify files to include in coverage
                exclude: [ // Specify files/patterns to exclude
                    'src/lib/paraglide/**',
                    'src/app.d.ts',
                    'src/hooks.server.ts',
                    'src/hooks.ts',
                    'src/generated/**',
                    'src/**/*.test.{js,ts}',
                    'src/**/*.spec.{js,ts}',
                    'src/**/mocks/**',
                    'src/**/stories/**', // Exclude storybook files
                    'src/routes/**/+page*.{ts,svelte}', // Exclude SvelteKit route files that are mostly markup
                    'src/routes/**/+layout*.{ts,svelte}',
                    'src/routes/**/+error*.{ts,svelte}',
                ],
            },
            projects: [
                {
                    extends: "./vite.config.ts", // This might be problematic
                    plugins: [svelteTesting()],

                    test: {
                        name: "client",
                        environment: "jsdom",
                        clearMocks: true,
                        include: ["src/**/*{.svelte,}.{test,spec}.{js,ts}"],
                        exclude: ["src/lib/server/**"],
                        setupFiles: ["./vitest-setup-client.ts"],
                        envFile: ".env.test",
                    },
                },
                {
                    extends: "./vite.config.ts",

                    test: {
                        name: "server",
                        environment: "node",
                        include: ["src/**/*.{test,spec}.{js,ts}"],
                        exclude: ["src/**/*.svelte.{test,spec}.{js,ts}"],
                    },
                },
            ],
        },
    };
});
