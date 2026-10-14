import { sveltekit } from "@sveltejs/kit/vite";
import { svelteTesting } from "@testing-library/svelte/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { sveltekitOptions } from "./sveltekit.options.js";

// Focused harness for the nonempty-base regression case: the real SvelteKit
// framework configured with a base path, so `resolve()` must apply the base
// exactly once. Only `*.base-spec.ts` files run here; the default unit and
// integration projects do not match that suffix.
export default defineConfig({
    plugins: [
        sveltekit({
            ...sveltekitOptions,
            paths: { base: "/test-base" },
        }),
        svelteTesting(),
    ],
    resolve: {
        dedupe: ["yjs", "yjs-orderedtree", "uuid"],
        alias: {
            "$lib": fileURLToPath(new URL("./src/lib", import.meta.url)),
            "$stores": fileURLToPath(new URL("./src/stores", import.meta.url)),
            "$shared": fileURLToPath(new URL("../shared/src", import.meta.url)),
        },
    },
    define: {
        global: "globalThis",
    },
    test: {
        name: "base",
        environment: "jsdom",
        include: ["src/**/*.base-spec.ts"],
        exclude: ["src/lib/server/**", "e2e/**"],
        setupFiles: ["./vitest-setup-client.ts"],
        envFile: ".env.test",
        testTimeout: 30000,
        coverage: { enabled: false },
        server: {
            fs: { allow: [".."] },
        },
    },
});
