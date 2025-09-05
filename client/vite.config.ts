import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vite";

export default defineConfig(async ({ mode }) => {
    // dotenvxで環境変数を読み込み（ESモジュール対応）
    const { config } = await import("@dotenvx/dotenvx");

    // テスト環境の場合は.env.testから環境変数を読み込み
    if (mode === "test" || process.env.NODE_ENV === "test") {
        console.log("Loading test environment variables from .env.test");
        config({ path: [".env.test"] });
    } else if (mode === "development") {
        console.log("Loading development environment variables from .env.development");
        config({ path: [".env.development"] });
    } else if (mode === "production") {
        console.log("Loading production environment variables from .env.production");
        config({ path: [".env.production"] });
    }

    return {
        plugins: [
            tailwindcss(),
            // Intercept removed endpoints early during dev to ensure expected 404
            {
                name: "deny-fluid-token-endpoint",
                configureServer(server) {
                    server.middlewares.use((req, res, next) => {
                        if (req.method === "GET" && req.url?.startsWith("/api/fluid-token")) {
                            res.statusCode = 404;
                            res.end("Not Found");
                            return;
                        }
                        next();
                    });
                },
            },
            sveltekit(),
            paraglideVitePlugin({
                project: "./project.inlang",
                outdir: "./src/lib/paraglide",
                strategy: ["url", "cookie", "baseLocale"],
            }),
        ],
        server: {
            port: parseInt(process.env.VITE_PORT || "7070"),
            strictPort: true,
            host: process.env.VITE_HOST || "localhost",
        },
        preview: {
            port: parseInt(process.env.VITE_PORT || "7070"),
            strictPort: true,
            host: process.env.VITE_HOST || "localhost",
        },
        build: {
            sourcemap: true,
            rollupOptions: {
                input: {
                    app: "./src/app.html",
                },
            },
        },
        optimizeDeps: {
            include: ["sql.js"],
        },
        define: {
            global: "globalThis",
        },
        test: {
            projects: [
                {
                    extends: "./vite.config.ts",
                    plugins: [svelteTesting()],

                    test: {
                        name: "unit",
                        environment: "jsdom",
                        clearMocks: true,
                        include: [
                            "src/tests/unit/**/*{.svelte,}.{test,spec}.{js,ts}",
                            "src/**/*{.svelte,}.{test,spec}.{js,ts}",
                        ],
                        exclude: [
                            "src/lib/server/**",
                            "src/tests/integration/**",
                            "src/tests/production/**",
                            "e2e/**",
                        ],
                        setupFiles: ["./vitest-setup-client.ts"],
                        envFile: ".env.test",
                    },
                    server: {
                        fs: {
                            allow: [".."],
                        },
                    },
                },
                {
                    extends: "./vite.config.ts",

                    test: {
                        name: "integration",
                        environment: "node",
                        clearMocks: true,
                        include: ["src/tests/integration/**/*{.svelte,}.{test,spec}.{js,ts}"],
                        exclude: ["src/lib/server/**"],
                        envFile: ".env.test",
                        testTimeout: 30000, // Integration testは時間がかかる可能性があるため
                    },
                    server: {
                        fs: {
                            allow: [".."],
                        },
                    },
                },
                {
                    extends: "./vite.config.ts",

                    test: {
                        name: "production",
                        environment: "jsdom",
                        clearMocks: true,
                        include: ["src/tests/production/**/*{.svelte,}.{test,spec}.{js,ts}"],
                        exclude: ["src/lib/server/**"],
                        envFile: ".env.production",
                        setupFiles: ["src/tests/production/setup.ts"],
                        testTimeout: 30000, // Production testは時間がかかる可能性があるため
                        hookTimeout: 30000,
                        globals: true,
                    },
                    server: {
                        fs: {
                            allow: [".."],
                        },
                    },
                },
            ],
        },
    };
});
