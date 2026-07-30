import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

describe("ENV-* Production Build Security Guard", () => {
    it("ensures test-only escape hatches do not leak into the production bundle", () => {
        // Try both client/build and ../build to find the output directory
        let buildDir = path.resolve(__dirname, "../../../build"); // if running from client/src/tests
        if (!fs.existsSync(buildDir)) {
            buildDir = path.resolve(__dirname, "../../build");
        }

        if (!fs.existsSync(buildDir)) {
            console.warn(`Build directory not found at ${buildDir}. Skipping bundle check. Run 'npm run build' first.`);
            return;
        }

        const forbiddenStrings = [
            { pattern: "window.editorOverlayStore=", readable: "editorOverlayStore leak" },
            { pattern: "window.__YJS_STORE__=", readable: "__YJS_STORE__ leak" },
            { pattern: "window.__FLUID_CLIENT_REGISTRY__=", readable: "__FLUID_CLIENT_REGISTRY__ leak" },
            { pattern: "window.__YJS_CLIENT_REGISTRY__=", readable: "__YJS_CLIENT_REGISTRY__ leak" },
            { pattern: "window.presenceStore=", readable: "presenceStore leak" },
            { pattern: "window.commandPaletteStore=", readable: "commandPaletteStore leak" },
            { pattern: "window.aliasPickerStore=", readable: "aliasPickerStore leak" },
            { pattern: 'alg:"none"', readable: "alg:none mock token generator" },
            { pattern: 'alg: "none"', readable: "alg:none mock token generator" },
            { pattern: "127.0.0.1:57070", readable: "Localhost Firebase function URL" },
            { pattern: "localhost:57070", readable: "Localhost Firebase function URL" },
            { pattern: "localhost:57000", readable: "Localhost Firebase hosting URL" },
        ];

        function findJsFiles(dir: string, fileList: string[] = []): string[] {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const filePath = path.join(dir, file);
                if (fs.statSync(filePath).isDirectory()) {
                    findJsFiles(filePath, fileList);
                } else if (filePath.endsWith(".js")) {
                    fileList.push(filePath);
                }
            }
            return fileList;
        }

        const jsFiles = findJsFiles(buildDir);
        expect(jsFiles.length).toBeGreaterThan(0); // Ensure we actually found files

        const leaks: string[] = [];
        for (const file of jsFiles) {
            const content = fs.readFileSync(file, "utf8");
            for (const rule of forbiddenStrings) {
                if (content.includes(rule.pattern)) {
                    leaks.push(
                        `Found prohibited string "${rule.pattern}" (${rule.readable}) in production bundle: ${
                            path.relative(process.cwd(), file)
                        }`,
                    );
                }
            }
        }

        expect(leaks).toEqual([]);
    });
});
