import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

const clientDir = path.resolve(__dirname, "../..");
const buildDir = path.resolve(clientDir, "../build");

/**
 * Internal store singletons and debug handles must never be reachable from
 * `window` in a production build. Each writer is gated behind a literal
 * `import.meta.env.MODE !== "production"` comparison so Rollup can drop it.
 *
 * The patterns below are matched against the minified bundle, where esbuild
 * emits assignments without surrounding whitespace (`window.foo=bar`).
 */
const forbiddenGlobals = [
    "appStore",
    "generalStore",
    "editorOverlayStore",
    "presenceStore",
    "commandPaletteStore",
    "aliasPickerStore",
    "userPreferencesStore",
    "__YJS_STORE__",
    "__YJS_SERVICE__",
    "__YJS_CLIENT_REGISTRY__",
    "__FLUID_CLIENT_REGISTRY__",
    "__FIRESTORE_STORE__",
    "__KEY_EVENT_HANDLER__",
    "__pollingMonitor",
];

const forbiddenStrings = [
    { pattern: 'alg:"none"', readable: "alg:none mock token generator" },
    { pattern: 'alg: "none"', readable: "alg:none mock token generator" },
    { pattern: "127.0.0.1:57070", readable: "Localhost Firebase function URL" },
    { pattern: "localhost:57070", readable: "Localhost Firebase function URL" },
    { pattern: "localhost:57000", readable: "Localhost Firebase hosting URL" },
];

function findJsFiles(dir: string, fileList: string[] = []): string[] {
    for (const file of fs.readdirSync(dir)) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            findJsFiles(filePath, fileList);
        } else if (filePath.endsWith(".js")) {
            fileList.push(filePath);
        }
    }
    return fileList;
}

describe("ENV-* Production Build Security Guard", () => {
    it("ensures test-only escape hatches do not leak into the production bundle", () => {
        // Build fresh: a stale or dev-mode build directory would let this guard
        // pass without ever inspecting production output.
        // `build:production` is the exact command the deploy workflow runs, so the
        // bundle inspected here is the one that ships.
        execFileSync("npm", ["run", "build:production"], {
            cwd: clientDir,
            stdio: "pipe",
            env: { ...process.env, NODE_ENV: "production" },
        });

        expect(fs.existsSync(buildDir), `Production build output missing at ${buildDir}`).toBe(true);

        const jsFiles = findJsFiles(buildDir);
        expect(jsFiles.length).toBeGreaterThan(0);

        const leaks: string[] = [];
        for (const file of jsFiles) {
            const content = fs.readFileSync(file, "utf8");
            const relative = path.relative(process.cwd(), file);

            for (const name of forbiddenGlobals) {
                // Match assignments only (`window.foo=`), not reads or comparisons
                // (`window.foo===`, `window.foo?.bar`), which are harmless once the
                // writer has been stripped.
                const assignment = new RegExp(`window\\.${name}\\s*=[^=]`);
                if (assignment.test(content)) {
                    leaks.push(`Found "window.${name} =" (internal store leak) in production bundle: ${relative}`);
                }
                // `Object.assign(window, { foo: ... })` is the other way these
                // handles have been published in the past.
                const objectAssign = new RegExp(`Object\\.assign\\(\\s*window\\s*,[^)]*\\b${name}\\b`);
                if (objectAssign.test(content)) {
                    leaks.push(
                        `Found "Object.assign(window, { ${name} })" (internal store leak) in production bundle: ${relative}`,
                    );
                }
            }

            for (const rule of forbiddenStrings) {
                if (content.includes(rule.pattern)) {
                    leaks.push(
                        `Found prohibited string "${rule.pattern}" (${rule.readable}) in production bundle: ${relative}`,
                    );
                }
            }
        }

        expect(leaks).toEqual([]);
    }, 600_000);
});

describe("Production Source-Level Security Guard", () => {
    it("ensures production code does not read internal stores from window or globalThis", () => {
        const srcDir = path.resolve(clientDir, "src");
        const tsFiles: string[] = [];

        function findTsFiles(dir: string) {
            for (const file of fs.readdirSync(dir)) {
                const filePath = path.join(dir, file);
                if (fs.statSync(filePath).isDirectory()) {
                    if (file !== "tests" && file !== "test") {
                        findTsFiles(filePath);
                    }
                } else if (
                    (filePath.endsWith(".ts") || filePath.endsWith(".svelte")) && !filePath.endsWith(".test.ts")
                    && !filePath.endsWith(".spec.ts")
                ) {
                    tsFiles.push(filePath);
                }
            }
        }

        findTsFiles(srcDir);

        const illegalReads: string[] = [];
        // We know these specific valid writers are allowed
        const allowedLines = {
            "store.svelte.ts": ["window.appStore = store;", "window.generalStore = store;"],
            "+layout.svelte": [
                "window.generalStore = window.generalStore || appStore;",
                "window.appStore = window.appStore || appStore;",
            ],
        };

        // Allowed readers that will be fixed separately in other PRs (grandfathered in)
        const allowedFiles = [
            "ScrapboxFormatter.ts",
            "EditorOverlayStore.svelte.ts",
            "service.ts", // yjs/service.ts
            "SearchBox.svelte",
            "KeyEventHandler.ts",
            "attachmentUpload.ts",
            "OutlinerItem.svelte",
            "SearchPanel.svelte",
            "testHelpers.ts",
        ];

        for (const file of tsFiles) {
            const fileName = path.basename(file);
            if (allowedFiles.includes(fileName)) {
                continue;
            }

            const fileContent = fs.readFileSync(file, "utf8");
            const lines = fileContent.split("\n");

            lines.forEach((line, index) => {
                if (
                    line.match(/(window|globalThis|w)(\?\.|\.)\s*(appStore|generalStore)/)
                    || line.match(/(appStore|generalStore)\s*=/)
                ) {
                    // Check if it's an allowed writer
                    const isAllowed = Object.entries(allowedLines).some(([allowedFile, allowedLns]) => {
                        return fileName === allowedFile && allowedLns.some(allowedLine => line.includes(allowedLine));
                    });

                    if (!isAllowed) {
                        // ignore comments
                        if (
                            !line.trim().startsWith("//") && !line.trim().startsWith("*")
                            && !line.trim().startsWith("<!--")
                        ) {
                            illegalReads.push(
                                `Found illegal access of internal store in ${path.relative(process.cwd(), file)}:${
                                    index + 1
                                }: ${line.trim()}`,
                            );
                        }
                    }
                }
            });
        }

        expect(illegalReads).toEqual([]);
    });
});
