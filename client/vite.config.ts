import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { sentrySvelteKit } from "@sentry/sveltekit";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { svelteTesting } from "@testing-library/svelte/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Absolute path to a package inside THIS client's node_modules. Used to pin the
// Yjs family so that ../shared/src (served as source by the dev server) resolves
// the exact same physical package the client bundles — regardless of where the
// shared/node_modules symlink happens to point in a given (possibly baked-image,
// npm-ci-skipped) environment. Without this, a divergent resolution makes Vite
// re-optimize deps mid-run and reload the page under in-flight e2e seeds.
const clientDep = (name: string): string => fileURLToPath(new URL(`./node_modules/${name}`, import.meta.url));

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
            // Intercept removed endpoints early during dev to ensure expected 404
            {
                name: "deny-fluid-token-endpoint",
                configureServer(server) {
                    server.middlewares.use((req, res, next) => {
                        if (req.url?.startsWith("/api/fluid-token")) {
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
            tailwindcss(),
            sveltekit(),
            paraglideVitePlugin({
                project: "./project.inlang",
                outdir: "./src/lib/paraglide",
                strategy: ["url", "cookie", "baseLocale"],
            }),
        ],
        resolve: {
            // The framework-neutral schema in ../shared/src is compiled into this
            // bundle. Force a single instance of Yjs (and yjs-orderedtree, which
            // imports Yjs) so the shared code and app code share one Y.Doc runtime
            // and never trip the "Yjs was already imported" dual-package hazard.
            //
            // The alias is authoritative (evaluated at config load, before node
            // resolution) so shared/src's bare `import "yjs"` resolves to this
            // client's copy no matter what shared/node_modules links to. Exact
            // `^name$` regexes avoid catching subpath imports (e.g. "uuid/...").
            alias: [
                { find: /^yjs$/, replacement: clientDep("yjs") },
                { find: /^yjs-orderedtree$/, replacement: clientDep("yjs-orderedtree") },
                { find: /^uuid$/, replacement: clientDep("uuid") },
            ],
            dedupe: ["yjs", "yjs-orderedtree", "uuid"],
        },
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
            // Disable HMR during E2E execution to prevent page reloading and closing
            hmr: process.env.E2E_DISABLE_HMR === "1" ? false : undefined,
            // Disable all file watching during E2E execution to prevent SSR/dev restarts
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
        esbuild: {
            // Strip debug console messages in production builds
            pure: mode === "production" ? ["console.debug", "logger.debug"] : [],
        },
        build: {
            sourcemap: true,
            // Minimally relax the warning threshold to accommodate manual chunk splitting
            chunkSizeWarningLimit: 1100,
            rollupOptions: {
                output: {
                    // Minimal vendor splitting + further subdivision of echarts to avoid exceeding 500kB
                    manualChunks(id: string) {
                        // Split ECharts by usage
                        if (id.includes("node_modules/echarts/")) {
                            if (id.includes("/lib/chart/")) return "echarts-charts";
                            if (id.includes("/lib/component/")) return "echarts-components";
                            return "echarts-core";
                        }
                        if (id.includes("node_modules/zrender/")) return "zrender";

                        // Consolidate Firebase into a single vendor chunk
                        if (id.includes("node_modules/firebase/")) return "firebase";

                        return undefined;
                    },
                },
                // Suppress and allow warnings for large chunks (e.g., ECharts)
                onwarn(warning: { code?: string; }, handler: (warning: { code?: string; }) => void) {
                    // Filter only Rollup's CHUNK_SIZE_LIMIT warning
                    if (warning.code === "CHUNK_SIZE_LIMIT") return;
                    handler(warning);
                },
            },
        },
        optimizeDeps: {
            // PGlite ships its own WASM assets and must not be pre-bundled.
            exclude: ["@electric-sql/pglite"],
            // The framework-neutral schema in ../shared/src imports these three.
            // Pre-bundle them at dev-server startup so Vite never discovers them
            // as "new" dependencies mid-run: a late discovery triggers a dep
            // re-optimization + full page reload, which tears the app out from
            // under an in-flight e2e seed (outliner-base disappears -> timeout).
            include: ["yjs", "yjs-orderedtree", "uuid"],
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
                    "src/engine_test.css",
                    "src/engine_result.css",
                    "src/cli_test_2.css",
                    "src/cli_result_2.css",
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
                        testTimeout: 30000,
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
