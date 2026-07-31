import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../../");

describe("Feature Documentation Test References", () => {
    it("ensures all tests entries in client-features and dev-features point to valid files", () => {
        const checkDir = (dir: string) => {
            const dirPath = path.join(ROOT, dir);
            if (!fs.existsSync(dirPath)) return;

            const files = fs.readdirSync(dirPath).filter(f => f.endsWith(".yaml"));
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const content = fs.readFileSync(filePath, "utf8");

                // Simple regex to extract tests list
                const lines = content.split("\n");
                let inTests = false;
                const tests: string[] = [];

                for (const line of lines) {
                    if (line.startsWith("tests:")) {
                        inTests = true;
                        continue;
                    }
                    if (inTests) {
                        if (line.startsWith("- ")) {
                            tests.push(line.substring(2).trim());
                        } else if (line.match(/^[a-z][a-z-]*:/)) {
                            inTests = false;
                        }
                    }
                }

                for (const test of tests) {
                    const checkPaths = [
                        path.join(ROOT, test),
                        path.join(ROOT, "client", test),
                        path.join(ROOT, "client", "e2e", test),
                        path.join(ROOT, "server", test),
                        path.join(ROOT, "functions", test),
                    ];

                    const exists = checkPaths.some(p => fs.existsSync(p));
                    expect(exists, `In ${file}: test file ${test} does not exist`).toBe(true);
                }
            }
        };

        checkDir("docs/client-features");
        checkDir("docs/dev-features");
    });
});
