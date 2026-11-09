import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/** @feature ENV-060bbae6
 * Validates both configurations with the actual pinned npm CLI and wasm plugins.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dprint = path.join(repoRoot, "node_modules/dprint/bin.cjs");

const cases = [
    ["dprint.json", "const answer = 42;\n"],
    ["functions/dprint.json", "const answer = 42;\n"],
] as const;

describe("pinned dprint configuration compatibility", () => {
    test.each(cases)("%s initializes and preserves required semicolons", (config, expected) => {
        const output = execFileSync(process.execPath, [
            dprint,
            "fmt",
            "--config",
            path.join(repoRoot, config),
            "--stdin",
            "sample.ts",
        ], {
            cwd: repoRoot,
            encoding: "utf8",
            input: "const answer=42\n",
        });
        expect(output).toBe(expected);
    });
});
