import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { createServer } from "vite";
import { describe, expect, it } from "vitest";

// A real Vite resolution/link/evaluation check. Run this on Windows as well as
// Linux: on a case-insensitive filesystem, extension probing of ../cursor can
// select ../Cursor.ts before directory/index.ts and lose the utility exports.
describe.each([false, true])(
    "production cursor entry points, case-insensitive extension probing=%s",
    (caseInsensitive) => {
        it("links and evaluates the intended exports through the production resolver", async () => {
            const server = await createServer({
                server: { middlewareMode: true, hmr: false },
                optimizeDeps: { noDiscovery: true, include: [] },
                // Reproduce Windows file-before-directory resolution on a Linux CI
                // filesystem too. Only the colliding production imports are mapped;
                // their actual modules are linked/evaluated, with no stubbed exports.
                plugins: caseInsensitive
                    ? [{
                        name: "case-insensitive-cursor-extension-probe",
                        enforce: "pre",
                        resolveId(source, importer) {
                            if (
                                importer && /\/(Cursor|CursorFormatting|CursorSelection)\.ts$/.test(importer)
                                && (source === "./cursor" || source === "../cursor")
                            ) {
                                return resolve(dirname(resolve(dirname(importer), source)), "Cursor.ts");
                            }
                        },
                    }]
                    : [],
            });
            try {
                for (
                    const path of [
                        "/src/lib/Cursor.ts",
                        "/src/lib/cursor/CursorFormatting.ts",
                        "/src/lib/cursor/CursorSelection.ts",
                    ]
                ) {
                    const module = await server.ssrLoadModule(path);
                    const name = path.split("/").at(-1)!.replace(".ts", "");
                    expect(typeof module[name]).toBe("function");
                    const importer = resolve(server.config.root, path.slice(1));
                    const source = ts.createSourceFile(
                        importer,
                        readFileSync(importer, "utf8"),
                        ts.ScriptTarget.Latest,
                    );
                    for (const statement of source.statements) {
                        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
                            continue;
                        }
                        const specifier = statement.moduleSpecifier.text;
                        if (!/^\.{1,2}\/cursor(?:\/index)?$/.test(specifier)) continue;
                        const resolved = await server.pluginContainer.resolveId(specifier, importer);
                        expect(resolved?.id.replace(/\\/g, "/")).toMatch(/\/cursor\/index\.ts$/);
                        const barrel = await server.ssrLoadModule(resolved!.id);
                        const bindings = statement.importClause?.namedBindings;
                        if (bindings && ts.isNamedImports(bindings)) {
                            for (const binding of bindings.elements) {
                                if (!binding.isTypeOnly) {
                                    expect(typeof barrel[(binding.propertyName ?? binding.name).text]).toBe("function");
                                }
                            }
                        }
                    }
                }
                const utilities = await server.ssrLoadModule("/src/lib/cursor/index.ts");
                expect(utilities.formatBold("text")).toBe("[[text]]");
                expect(typeof utilities.searchItem).toBe("function");
                expect(typeof utilities.getCurrentLineIndex).toBe("function");
                expect(typeof utilities.getLineStartOffset).toBe("function");
                expect(typeof utilities.getLineEndOffset).toBe("function");
            } finally {
                await server.close();
            }
        }, 60000);
    },
);
