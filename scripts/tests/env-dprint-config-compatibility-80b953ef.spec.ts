import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/** @feature ENV-060bbae6
 * Validates both configurations with the actual pinned npm CLI and wasm plugins.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dprint = path.join(repoRoot, "node_modules/dprint/bin.cjs");

function format(config: string, input: string): string {
    return execFileSync(process.execPath, [
        dprint,
        "fmt",
        "--config",
        path.join(repoRoot, config),
        "--stdin",
        "sample.ts",
    ], { cwd: repoRoot, encoding: "utf8", input });
}

const hangingCases = [
    [
        "arguments",
        `consume({
    firstPropertyWithADescriptiveName: "first property value",
    secondPropertyWithADescriptiveName: "second property value",
}, { other: true });
`,
    ],
    [
        "arrays",
        `const items = [{ other: true }, {
    firstPropertyWithADescriptiveName: "first property value",
    secondPropertyWithADescriptiveName: "second property value",
}];
`,
    ],
] as const;

describe("pinned dprint configuration compatibility", () => {
    test.each(["dprint.json", "functions/dprint.json"])(
        "%s initializes and preserves required semicolons",
        config => {
            expect(format(config, "const answer=42\n")).toBe("const answer = 42;\n");
        },
    );

    test.each(hangingCases)("preserves the existing hanging %s layout", (_name, input) => {
        expect(format("dprint.json", input)).toBe(input);
    });
});
