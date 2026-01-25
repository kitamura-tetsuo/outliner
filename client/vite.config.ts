import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { sentrySvelteKit } from "@sentry/sveltekit";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vite";

export default defineConfig(async ({ mode }) => {
    // Load environment variables with dotenvx (ES module support)
    const { config } = await import("@dotenvx/dotenvx");

    // Load environment variables from .env.test if in test environment
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

            sentrySvelteKit({
                sourceMapsUploadOptions: {
                    enabled: false,
                },
            }),
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
            proxy: {
                "/api": {
                    target: `http://${process.env.VITE_HOST || "localhost"}:${
                        process.env.FIREBASE_HOSTING_PORT || "57000"
                    }`,
                    changeOrigin: true,
                },
            },
            // Disable HMR during E2E execution to prevent page close due to reload during test
            hmr: process.env.E2E_DISABLE_HMR === "1" ? false : undefined,
            // Completely disable file watching during E2E execution to prevent SSR/dev restart
            watch: process.env.E2E_DISABLE_WATCH === "1"
                ? { ignored: ["**"] }
                : {
                    ignored: [
                        "**/e2e-snapshots/**",
                        "**/test-results/**",
                        "**/playwright-report/**",
                        "**/playwright/**",
                    ],
                },
            fs: {
                allow: [".."],
            },
        },
        preview: {
            port: parseInt(process.env.VITE_PORT || "7070"),
            strictPort: true,
            host: process.env.VITE_HOST || "localhost",
        },
        build: {
            sourcemap: true,
            // Keep warning threshold relaxation minimal in line with manual chunk splitting application
            chunkSizeWarningLimit: 1100,
            rollupOptions: {
                output: {
                    // Minimal vendor splitting + further subdivision of echarts to avoid exceeding 500kB
                    manualChunks(id: string) {
                        // Split ECharts related items by usage
                        if (id.includes("node_modules/echarts/")) {
                            if (id.includes("/lib/chart/")) return "echarts-charts";
                            if (id.includes("/lib/component/")) return "echarts-components";
                            return "echarts-core";
                        }
                        if (id.includes("node_modules/zrender/")) return "zrender";

                        // Aggregate Firebase into a single vendor chunk
                        if (id.includes("node_modules/firebase/")) return "firebase";

                        return undefined;
                    },
                },
                // Suppress and accept warnings for large chunks (e.g. ECharts)
                onwarn(warning: { code?: string; }, handler: (warning: { code?: string; }) => void) {
                    // Filter only Rollup's CHUNK_SIZE_LIMIT warning
                    if (warning.code === "CHUNK_SIZE_LIMIT") return;
                    handler(warning);
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
            // Common coverage settings for all projects
            coverage: {
                provider: "v8",
                reporter: ["text", "json", "html", "lcov"],
                reportsDirectory: "../coverage/unit_and_integration",
                include: ["src/**/*.{js,ts,svelte}"],
                exclude: [
                    "src/**/*.spec.{js,ts}",
                    "src/**/*.test.{js,ts}",
                    "src/tests/**",
                    "src/lib/paraglide/**",
                    "src/stories/**",
                    "src/app.html",
                    "src/service-worker.ts",
                    "src/vite-env.d.ts",
                    "src/global.d.ts",
                    "src/app.d.ts",
                ],
                clean: true,
            },
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
                        coverage: {
                            enabled: true,
                        },
                    },
                    server: {
                        fs: {
                            allow: [".."],
                        },
                    },
                },
                {
                    extends: "./vite.config.ts",
                    plugins: [svelteTesting()],

                    test: {
                        name: "integration",
                        environment: "jsdom",
                        clearMocks: true,
                        include: ["src/tests/integration/**/*{.svelte,}.{test,spec}.{js,ts}"],
                        exclude: ["src/lib/server/**"],
                        envFile: ".env.test",
                        testTimeout: 30000, // Integration tests may take time
                        setupFiles: ["./vitest-setup-client.ts", "./src/tests/integration/setup.ts"],
                        coverage: {
                            enabled: true,
                        },
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
                        testTimeout: 30000, // Production tests may take time
                        hookTimeout: 30000,
                        globals: true,
                        coverage: {
                            enabled: false, // Production tests are excluded from coverage
                        },
                    },
                    server: {
                        fs: {
                            allow: [".."],
                        },
                        watch: {
                            ignored: ["**/coverage/**", "coverage/**"],
                        },
                    },
                },
            ],
        },
    };
});
