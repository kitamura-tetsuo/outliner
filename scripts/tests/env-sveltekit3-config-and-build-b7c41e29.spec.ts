import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { beforeAll, describe, expect, test } from "vitest";

/** @feature ENV-b7c41e29
 *  Title   : SvelteKit 3 configuration lives in the Vite config
 *  Source  : docs/dev-features/env-sveltekit3-config-and-build-b7c41e29.yaml
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const clientDir = path.join(repoRoot, "client");
const buildDir = path.join(repoRoot, "build");

/** Runs a client-local command (its own node_modules/.bin first on PATH). */
function runInClient(command: string, args: string[], timeout = 600_000) {
    const result = spawnSync(command, args, {
        cwd: clientDir,
        encoding: "utf-8",
        timeout,
        env: { ...process.env, PATH: `${path.join(clientDir, "node_modules/.bin")}:${process.env.PATH}` },
    });
    return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

describe("SvelteKit 3 configuration", () => {
    test("svelte-kit sync accepts the configuration (no legacy svelte.config.js)", () => {
        expect(fs.existsSync(path.join(clientDir, "svelte.config.js"))).toBe(false);
        const { status, output } = runInClient("svelte-kit", ["sync"], 120_000);
        expect(output).not.toContain("config_file_unsupported");
        expect(status, output).toBe(0);
    });

    // `vite` (dev server, E2E server, production build) resolves vite.config.js
    // first, while Vitest resolves vite.config.ts: both must hand SvelteKit the
    // same adapter, aliases and manual service-worker registration.
    test("both Vite configs pass the same SvelteKit options to the plugin", () => {
        const probe = `
            import { resolveConfig } from "vite";
            const out = {};
            for (const configFile of ["vite.config.js", "vite.config.ts"]) {
                const config = await resolveConfig({ configFile, mode: "production", logLevel: "silent" }, "build");
                const options = config.plugins.find(p => p.name === "vite-plugin-sveltekit-setup")?.api?.options;
                out[configFile] = {
                    adapter: options?.adapter?.name,
                    alias: options?.alias,
                    serviceWorker: options?.serviceWorker,
                    extensions: options?.extensions,
                };
            }
            console.log("PROBE" + JSON.stringify(out));
        `;
        const { status, output } = runInClient("node", ["--input-type=module", "-e", probe], 120_000);
        expect(status, output).toBe(0);
        const resolved = JSON.parse(output.slice(output.indexOf("PROBE") + 5).split("\n")[0]);
        const expected = {
            adapter: "@sveltejs/adapter-static",
            alias: { $lib: "src/lib", $stores: "src/stores", $shared: "../shared/src" },
            serviceWorker: { register: false },
            extensions: [".svelte", ".svx"],
        };
        expect(resolved["vite.config.js"]).toEqual(expected);
        expect(resolved["vite.config.ts"]).toEqual(expected);
    });

    test("ESLint loads its Svelte configuration and accepts the migrated consumers", () => {
        const { status, output } = runInClient("eslint", [
            "--max-warnings=0",
            "src/service-worker.ts",
            "src/params.ts",
            "src/hooks.server.ts",
            "src/routes/[project]/[page]/+page.svelte",
            "src/routes/[demoProject=demoProject]/-/tables/[tableId]/+page.svelte",
        ], 300_000);
        expect(status, output).toBe(0);
    });
});

describe("SvelteKit 3 production build", () => {
    let build: { status: number | null; output: string; };

    beforeAll(() => {
        fs.rmSync(buildDir, { recursive: true, force: true });
        build = runInClient("npm", ["run", "build"], 900_000);
    }, 900_000);

    test("completes and emits the SPA to the Firebase Hosting directory", () => {
        expect(build.status, build.output).toBe(0);
        const html = fs.readFileSync(path.join(buildDir, "index.html"), "utf-8");
        // index.html is the SPA fallback shell, not a prerendered page.
        expect(html).toContain("fallback");
        expect(fs.existsSync(path.join(buildDir, "_app/immutable"))).toBe(true);
        expect(fs.existsSync(path.join(buildDir, "favicon.png"))).toBe(true);
    });

    test("builds the service worker from $app/manifest without auto-registration", () => {
        const worker = fs.readFileSync(path.join(buildDir, "service-worker.js"), "utf-8");
        expect(worker).not.toMatch(/__SVELTEKIT_MANIFEST_|__sveltekit_manifest_/);

        // Every emitted immutable entry chunk is in the precache manifest.
        const entryDir = path.join(buildDir, "_app/immutable/entry");
        const entries = fs.readdirSync(entryDir).filter(file => file.endsWith(".js"));
        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries) {
            expect(worker).toContain(`_app/immutable/entry/${entry}`);
        }
        // Static assets come along too.
        expect(worker).toContain("favicon.png");

        // Registration stays manual (src/routes/+layout.svelte), so SvelteKit
        // must not inject its own.
        expect(fs.readFileSync(path.join(buildDir, "index.html"), "utf-8")).not.toContain("serviceWorker");
    });
});
