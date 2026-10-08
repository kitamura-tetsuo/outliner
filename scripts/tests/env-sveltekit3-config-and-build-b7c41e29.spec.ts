import { spawnSync } from "child_process";
import fs from "fs";
import http from "http";
import { createRequire } from "module";
import type { AddressInfo } from "net";
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
function runInClient(command: string, args: string[], timeout = 600_000, extraEnv: NodeJS.ProcessEnv = {}) {
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: `${path.join(clientDir, "node_modules/.bin")}:${process.env.PATH}`,
        ...extraEnv,
    };
    // Vitest exports NODE_ENV=test, which would make Vite build a development
    // bundle (import.meta.env.DEV) and strip the production-only service
    // worker registration. The build under test must be the deployed one.
    if (extraEnv.NODE_ENV === undefined && "NODE_ENV" in extraEnv) delete env.NODE_ENV;
    const result = spawnSync(command, args, {
        cwd: clientDir,
        encoding: "utf-8",
        timeout,
        env,
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
        // The command the deploy workflow runs (.github/workflows/deploy.yml).
        build = runInClient("npm", ["run", "build:production"], 900_000, { NODE_ENV: undefined });
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

describe("SvelteKit 3 production service worker in a browser", () => {
    const contentTypes: Record<string, string> = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".json": "application/json",
        ".wasm": "application/wasm",
    };

    /** Firebase Hosting for the static output: files as-is, index.html as the SPA fallback. */
    function serveBuild(): Promise<http.Server> {
        const server = http.createServer((req, res) => {
            const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
            let file = path.join(buildDir, pathname);
            if (!file.startsWith(buildDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
                file = path.join(buildDir, "index.html");
            }
            res.writeHead(200, { "content-type": contentTypes[path.extname(file)] ?? "application/octet-stream" });
            fs.createReadStream(file).pipe(res);
        });
        return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server)));
    }

    /** Same Chromium resolution as client/playwright.config.ts. */
    function chromiumExecutable(): string | undefined {
        const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
        if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
        const marker = path.join(repoRoot, ".playwright-chromium-path");
        const recorded = fs.existsSync(marker) ? fs.readFileSync(marker, "utf8").trim() : "";
        return recorded && fs.existsSync(recorded) ? recorded : undefined;
    }

    test("the app registers the built worker, which activates, precaches and serves offline", async () => {
        // Relies on the production build made by the suite above.
        expect(fs.existsSync(path.join(buildDir, "service-worker.js"))).toBe(true);
        const { chromium } = createRequire(path.join(clientDir, "package.json"))(
            "@playwright/test",
        ) as typeof import("@playwright/test");
        const server = await serveBuild();
        const executablePath = chromiumExecutable();
        const browser = await chromium.launch({
            args: ["--no-sandbox"],
            ...(executablePath ? { executablePath } : {}),
        });
        try {
            const context = await browser.newContext();
            const page = await context.newPage();
            const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
            await page.goto(`${base}/`);

            // No test code registers anything: this is the app's own manual
            // registration (src/routes/+layout.svelte) of the built worker.
            const worker = await page.evaluate(async () => {
                const within = <T>(promise: Promise<T>, what: string) =>
                    Promise.race([
                        promise,
                        new Promise<never>((_, reject) =>
                            setTimeout(() => reject(new Error(`service worker ${what} within 30s`)), 30_000)
                        ),
                    ]);
                const registration = await within(navigator.serviceWorker.ready, "was not registered and ready");
                const active = registration.active!;
                if (active.state !== "activated") {
                    await within(
                        new Promise<void>(resolve =>
                            active.addEventListener("statechange", () => active.state === "activated" && resolve())
                        ),
                        "did not activate",
                    );
                }
                const names = await caches.keys();
                const name = names.find(n => n.startsWith("outliner-cache-"));
                const cached = name
                    ? (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)
                    : [];
                return { scriptURL: active.scriptURL, state: active.state, names, cached };
            });
            expect(worker.scriptURL).toBe(`${base}/service-worker.js`);
            expect(worker.state).toBe("activated");
            expect(worker.names).toHaveLength(1);

            // The precache holds the shell, every emitted entry chunk and the static assets.
            expect(worker.cached).toContain("/");
            expect(worker.cached).toContain("/favicon.png");
            const entries = fs.readdirSync(path.join(buildDir, "_app/immutable/entry"));
            expect(entries.length).toBeGreaterThan(0);
            for (const entry of entries) {
                expect(worker.cached).toContain(`/_app/immutable/entry/${entry}`);
            }

            // Offline, a navigation to any app route is answered from the cache
            // with the app shell.
            await context.setOffline(true);
            const offline = await page.goto(`${base}/some-project/some-page`);
            expect(offline?.status()).toBe(200);
            expect(await page.content()).toContain("/_app/immutable/entry/");
        } finally {
            await browser.close();
            await new Promise(resolve => server.close(resolve));
        }
    }, 180_000);
});
