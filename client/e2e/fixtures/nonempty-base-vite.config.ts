import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { sveltekitOptions } from "../../sveltekit.options.js";

const sourceClientRoot = process.env.OPAQUE_URL_SOURCE_CLIENT_ROOT
    || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const clientRoot = process.env.OPAQUE_URL_TEST_ROOT || sourceClientRoot;
const applicationBase = process.env.OPAQUE_URL_TEST_BASE === "/app" ? "/app" : "";

// This fixture boots the real application router with a deployment base. It
// intentionally changes configuration rather than mocking $app/paths or goto,
// so browser tests exercise the same generated framework boundary as a
// nonempty-base deployment.
export default defineConfig({
    root: clientRoot,
    // Keep dependency-optimizer metadata out of the shared node_modules tree;
    // this fixture runs beside the primary E2E Vite server in CI.
    cacheDir: path.join(clientRoot, ".vite-cache"),
    plugins: [
        {
            name: "nonempty-base-libpg-query-wasm",
            configureServer(server) {
                server.middlewares.use((request, response, next) => {
                    if (!request.url?.split("?", 1)[0].endsWith("/libpg-query.wasm")) return next();
                    response.setHeader("Content-Type", "application/wasm");
                    fs.createReadStream(path.join(sourceClientRoot, "node_modules/libpg-query/wasm/libpg-query.wasm"))
                        .pipe(response);
                });
            },
        },
        paraglideVitePlugin({
            project: "./project.inlang",
            outdir: "./src/lib/paraglide",
            strategy: ["url", "cookie", "baseLocale"],
        }),
        tailwindcss(),
        sveltekit({
            ...sveltekitOptions,
            paths: { base: applicationBase },
        }),
    ],
    resolve: {
        dedupe: ["yjs", "yjs-orderedtree", "uuid"],
        alias: {
            "$lib": path.join(clientRoot, "src/lib"),
            "$stores": path.join(clientRoot, "src/stores"),
            "$shared": path.resolve(sourceClientRoot, "../shared/src"),
            "yjs": path.join(sourceClientRoot, "node_modules/yjs"),
        },
    },
    server: { strictPort: true },
});
