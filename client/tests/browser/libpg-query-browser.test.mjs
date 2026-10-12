import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createServer } from "vite";

test("production SQL validator initializes real PostgreSQL WASM in browser and Node", async () => {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const validator = readFileSync(
        new URL("../../../shared/src/services/explicitSelectAlias.ts", import.meta.url),
        "utf8",
    );
    // Compile the actual production TS module. Keep its package import intact so
    // Vite resolves libpg-query's real browser ESM entry and module-relative WASM.
    const javascript = ts.transpileModule(validator, {
        compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
    }).outputText;
    const server = await createServer({
        root,
        configFile: false,
        optimizeDeps: { noDiscovery: true, exclude: ["libpg-query"] },
        server: { host: "127.0.0.1", port: 0 },
        plugins: [{
            name: "sql-browser-regression-entry",
            resolveId(id) {
                if (id === "/sql-validator.js") return "\0sql-validator";
            },
            load(id) {
                if (id === "\0sql-validator") return javascript;
            },
            configureServer(vite) {
                vite.middlewares.use((req, res, next) => {
                    if (req.url === "/sql-browser-regression") {
                        res.setHeader("Content-Type", "text/html");
                        res.end(`<script type="module">
                            import { validateExplicitSelectAliases } from "/sql-validator.js";
                            validateExplicitSelectAliases("SELECT 1 AS value");
                            let implicitRejected = false, invalidRejected = false;
                            try { validateExplicitSelectAliases("SELECT 1 value"); } catch { implicitRejected = true; }
                            try { validateExplicitSelectAliases("SELECT FROM"); } catch { invalidRejected = true; }
                            globalThis.sqlBrowserResult = { implicitRejected, invalidRejected };
                        </script>`);
                    } else next();
                });
            },
        }],
    });
    let browser;
    try {
        await server.listen();
        browser = await chromium.launch({
            headless: true,
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
            args: ["--no-sandbox"],
        });
        const page = await browser.newPage();
        const errors = [], wasmResponses = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("response", response => {
            if (new URL(response.url()).pathname.endsWith("libpg-query.wasm")) wasmResponses.push(response.status());
        });
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/sql-browser-regression`);
        try {
            await page.waitForFunction(() => "sqlBrowserResult" in globalThis, undefined, { timeout: 10000 });
        } catch (error) {
            throw new Error(`Browser SQL initialization failed: ${errors.join("; ")}`, { cause: error });
        }
        assert.deepEqual(await page.evaluate(() => globalThis.sqlBrowserResult), {
            implicitRejected: true,
            invalidRejected: true,
        });
        assert.deepEqual(errors, []);
        assert.deepEqual(wasmResponses, [200]);
        const pg = createRequire(import.meta.url)("libpg-query");
        await pg.loadModule();
        assert.equal(pg.parseSync("SELECT 1 AS value").stmts.length, 1);
    } finally {
        await browser?.close();
        await server.close();
    }
});
