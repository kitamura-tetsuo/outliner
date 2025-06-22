import { paraglide } from "@inlang/paraglide-sveltekit/vite";
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
    }
    else if (mode === "development") {
        console.log("Loading development environment variables from .env.development");
        config({ path: [".env.development"] });
    }

    return {
        plugins: [
            tailwindcss(),
            sveltekit(),
            paraglide({
                project: "./project.inlang",
                outdir: "./src/lib/paraglide",
            }),
        ],
        server: {
            port: parseInt(process.env.VITE_PORT || "7070"),
            strictPort: true,
            host: process.env.VITE_HOST || "192.168.50.13",
        },
        preview: {
            port: parseInt(process.env.VITE_PORT || "7070"),
            strictPort: true,
            host: process.env.VITE_HOST || "192.168.50.13",
        },
        build: {
            sourcemap: true,
        },
        test: {
            workspace: [
                {
                    extends: "./vite.config.ts",
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
                        exclude: [
                            "src/**/*.svelte.{test,spec}.{js,ts}",
                            "src/components/**/*.{test,spec}.{js,ts}",
                            "src/routes/**/*.{test,spec}.{js,ts}",
                            "src/lib/fluidService.test.ts" // Exclude this from server tests
                        ],
                    },
                },
            ],
        },
    };
});
